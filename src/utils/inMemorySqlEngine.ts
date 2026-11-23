import { parseSqlDdl } from './sqlDdlParser';

export interface QueryResult {
  columns: string[];
  rows: any[][];
  rowCount: number;
  executionTimeMs: number;
  message?: string;
  error?: string;
}

export interface TableColumnSchema {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
}

export interface TableData {
  name: string;
  columns: TableColumnSchema[];
  rows: Record<string, any>[];
}

export class InMemorySqlDatabase {
  private tables: Map<string, TableData> = new Map();

  constructor() {
    this.tables = new Map();
  }

  public reset(): void {
    this.tables.clear();
  }

  public getTableNames(): string[] {
    return Array.from(this.tables.keys());
  }

  public getTable(name: string): TableData | undefined {
    return this.tables.get(name.toLowerCase());
  }

  /**
   * Executes a multi-statement SQL script (DDL, INSERTs, SELECTs)
   * and returns the result of the final query (or summary of mutations).
   */
  public execute(sqlScript: string): QueryResult {
    const startTime = performance.now();
    const clean = sqlScript.trim();
    if (!clean) {
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: 0,
        message: 'No SQL statements executed.',
      };
    }

    try {
      // Split into discrete SQL statements, respecting quoted strings
      const statements = this.splitStatements(clean);
      let lastResult: QueryResult = {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: 0,
        message: 'Success',
      };

      for (const rawStmt of statements) {
        // Strip leading and intra-statement comments
        const cleanedStmt = rawStmt
          .split('\n')
          .filter((line) => !line.trim().startsWith('--'))
          .join('\n')
          .trim();
        if (!cleanedStmt) continue;

        const stmt = cleanedStmt;
        const upper = stmt.toUpperCase();
        if (upper.startsWith('CREATE TABLE')) {
          lastResult = this.executeCreateTable(stmt);
        } else if (upper.startsWith('INSERT INTO')) {
          lastResult = this.executeInsert(stmt);
        } else if (upper.startsWith('DROP TABLE')) {
          lastResult = this.executeDropTable(stmt);
        } else if (upper.startsWith('SELECT') || upper.startsWith('WITH')) {
          lastResult = this.executeSelect(stmt);
        } else {
          // Unknown or unhandled statement: acknowledge without error
          lastResult = {
            columns: ['status'],
            rows: [['Statement executed']],
            rowCount: 1,
            executionTimeMs: 0,
            message: `Executed: ${stmt.slice(0, 40)}...`,
          };
        }
      }

      const totalTime = Math.max(0.1, Number((performance.now() - startTime).toFixed(2)));
      return {
        ...lastResult,
        executionTimeMs: totalTime,
      };
    } catch (err: any) {
      const totalTime = Math.max(0.1, Number((performance.now() - startTime).toFixed(2)));
      return {
        columns: ['error'],
        rows: [[err?.message || 'Execution error']],
        rowCount: 0,
        executionTimeMs: totalTime,
        error: err?.message || 'SQL execution failed.',
      };
    }
  }

  private splitStatements(sql: string): string[] {
    const stmts: string[] = [];
    let current = '';
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < sql.length; i++) {
      const ch = sql[i];
      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
        current += ch;
      } else if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
        current += ch;
      } else if (ch === ';' && !inSingle && !inDouble) {
        if (current.trim()) stmts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) stmts.push(current.trim());
    return stmts;
  }

  private executeCreateTable(stmt: string): QueryResult {
    const match = stmt.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+["`]?([A-Za-z0-9_]+)["`]?\s*\(([\s\S]+)\)/i);
    if (!match) {
      throw new Error('Malformed CREATE TABLE statement.');
    }
    const tableName = match[1].toLowerCase();
    const body = match[2];

    const colLines = body.split(',').map((l) => l.trim()).filter(Boolean);
    const columns: TableColumnSchema[] = [];

    for (const line of colLines) {
      if (/^\s*(?:PRIMARY\s+KEY|FOREIGN\s+KEY|CONSTRAINT|UNIQUE|INDEX|CHECK)\b/i.test(line)) {
        continue;
      }
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const colName = parts[0].replace(/["`]/g, '');
        const colType = parts[1];
        columns.push({
          name: colName,
          type: colType,
          isPrimaryKey: /PRIMARY\s+KEY/i.test(line),
        });
      }
    }

    this.tables.set(tableName, {
      name: tableName,
      columns,
      rows: [],
    });

    return {
      columns: ['status'],
      rows: [[`Table '${tableName}' created with ${columns.length} columns`]],
      rowCount: 1,
      executionTimeMs: 0,
      message: `Table '${tableName}' created successfully.`,
    };
  }

  private executeDropTable(stmt: string): QueryResult {
    const match = stmt.match(/DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+["`]?([A-Za-z0-9_]+)["`]?/i);
    if (match) {
      this.tables.delete(match[1].toLowerCase());
    }
    return {
      columns: ['status'],
      rows: [['Table dropped']],
      rowCount: 1,
      executionTimeMs: 0,
    };
  }

  private executeInsert(stmt: string): QueryResult {
    const match = stmt.match(/INSERT\s+INTO\s+["`]?([A-Za-z0-9_]+)["`]?\s*(?:\(([^)]+)\))?\s*VALUES\s*([\s\S]+)/i);
    if (!match) {
      throw new Error('Malformed INSERT INTO statement.');
    }
    const tableName = match[1].toLowerCase();
    const table = this.tables.get(tableName);
    if (!table) {
      throw new Error(`Table '${tableName}' does not exist.`);
    }

    const colNames = match[2]
      ? match[2].split(',').map((c) => c.trim().replace(/["`]/g, ''))
      : table.columns.map((c) => c.name);

    const rawValues = match[3];
    // Match each row enclosed in parens: (val1, val2, ...)
    const rowMatches = rawValues.match(/\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)/g);
    if (!rowMatches) {
      throw new Error('No values found in INSERT statement.');
    }

    let insertedCount = 0;
    for (const rowStr of rowMatches) {
      const inner = rowStr.slice(1, -1).trim();
      const rawVals = this.splitCsvValues(inner);
      const rowObj: Record<string, any> = {};

      for (let i = 0; i < colNames.length; i++) {
        const cname = colNames[i];
        const rawV = rawVals[i]?.trim();
        rowObj[cname] = this.parseLiteralValue(rawV);
      }
      table.rows.push(rowObj);
      insertedCount++;
    }

    return {
      columns: ['status', 'inserted_rows'],
      rows: [[`Inserted into ${tableName}`, insertedCount]],
      rowCount: insertedCount,
      executionTimeMs: 0,
      message: `Inserted ${insertedCount} rows into '${tableName}'.`,
    };
  }

  private splitCsvValues(csv: string): string[] {
    const values: string[] = [];
    let cur = '';
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < csv.length; i++) {
      const ch = csv[i];
      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
        cur += ch;
      } else if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
        cur += ch;
      } else if (ch === ',' && !inSingle && !inDouble) {
        values.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) values.push(cur.trim());
    return values;
  }

  private parseLiteralValue(raw: string | undefined): any {
    if (!raw || raw.toUpperCase() === 'NULL') return null;
    if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
      return raw.slice(1, -1);
    }
    if (raw.toUpperCase() === 'TRUE') return true;
    if (raw.toUpperCase() === 'FALSE') return false;
    const num = Number(raw);
    if (!isNaN(num)) return num;
    return raw;
  }

  private executeSelect(stmt: string): QueryResult {
    // Basic SELECT projection & FROM parser
    const fromMatch = stmt.match(/FROM\s+["`]?([A-Za-z0-9_]+)["`]?(\s+(?:AS\s+)?([A-Za-z0-9_]+))?/i);
    if (!fromMatch) {
      // Literal calculation like SELECT 1 + 1 AS result;
      const selectMatch = stmt.match(/SELECT\s+([\s\S]+?)(?:;|$)/i);
      if (selectMatch) {
        return {
          columns: ['result'],
          rows: [[selectMatch[1].trim()]],
          rowCount: 1,
          executionTimeMs: 0,
        };
      }
      throw new Error('SELECT without FROM not supported for complex expressions.');
    }

    const tableName = fromMatch[1].toLowerCase();
    const tableAlias = fromMatch[3]?.toLowerCase() || tableName;
    const table = this.tables.get(tableName);
    if (!table) {
      throw new Error(`Table '${tableName}' does not exist in sandbox.`);
    }

    let dataset = table.rows.map((r) => ({ ...r }));

    // Check for JOIN
    const joinMatch = stmt.match(/JOIN\s+["`]?([A-Za-z0-9_]+)["`]?(\s+(?:AS\s+)?([A-Za-z0-9_]+))?\s+ON\s+([\s\S]+?)(?=\s+(?:WHERE|GROUP|ORDER|LIMIT|;|$))/i);
    if (joinMatch) {
      const joinTableName = joinMatch[1].toLowerCase();
      const joinTable = this.tables.get(joinTableName);
      const onClause = joinMatch[4].trim();
      const onEq = onClause.match(/([A-Za-z0-9_.]+)\s*=\s*([A-Za-z0-9_.]+)/);

      if (joinTable && onEq) {
        const leftCol = onEq[1].includes('.') ? onEq[1].split('.')[1] : onEq[1];
        const rightCol = onEq[2].includes('.') ? onEq[2].split('.')[1] : onEq[2];

        const joinedRows: Record<string, any>[] = [];
        for (const row1 of dataset) {
          for (const row2 of joinTable.rows) {
            const val1 = row1[leftCol] ?? row1[rightCol];
            const val2 = row2[rightCol] ?? row2[leftCol];
            if (val1 !== undefined && val2 !== undefined && val1 === val2) {
              joinedRows.push({ ...row1, ...row2 });
            }
          }
        }
        dataset = joinedRows;
      }
    }

    // WHERE filtering
    const whereMatch = stmt.match(/WHERE\s+([\s\S]+?)(?=\s+(?:GROUP\s+BY|ORDER\s+BY|LIMIT|;|$))/i);
    if (whereMatch) {
      const whereCond = whereMatch[1].trim();
      dataset = dataset.filter((row) => this.evaluateWhere(row, whereCond));
    }

    // ORDER BY
    const orderMatch = stmt.match(/ORDER\s+BY\s+([A-Za-z0-9_.]+)(?:\s+(ASC|DESC))?/i);
    if (orderMatch) {
      const orderCol = orderMatch[1].includes('.') ? orderMatch[1].split('.')[1] : orderMatch[1];
      const isDesc = (orderMatch[2] || 'ASC').toUpperCase() === 'DESC';
      dataset.sort((a, b) => {
        const va = a[orderCol];
        const vb = b[orderCol];
        if (va === vb) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return isDesc ? (va > vb ? -1 : 1) : va < vb ? -1 : 1;
      });
    }

    // LIMIT
    const limitMatch = stmt.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      const lim = parseInt(limitMatch[1], 10);
      dataset = dataset.slice(0, lim);
    }

    // Projections
    const selectClauseMatch = stmt.match(/SELECT\s+([\s\S]+?)\s+FROM/i);
    if (!selectClauseMatch) {
      throw new Error('Unable to parse SELECT projections.');
    }
    const selectProjections = selectClauseMatch[1].trim();

    if (selectProjections === '*') {
      const cols = table.columns.map((c) => c.name);
      const rows = dataset.map((r) => cols.map((c) => r[c] ?? null));
      return {
        columns: cols,
        rows,
        rowCount: rows.length,
        executionTimeMs: 0,
      };
    }

    const projList = this.splitCsvValues(selectProjections);
    const columns: string[] = [];
    const getters: ((r: Record<string, any>) => any)[] = [];

    // Check if query is an aggregate query like COUNT(*), SUM(amount)
    const isAggregate = projList.some((p) => /\b(COUNT|SUM|AVG|MIN|MAX)\b/i.test(p));

    if (isAggregate) {
      const aggRow: any[] = [];
      for (const p of projList) {
        const aliasMatch = p.match(/(?:AS\s+)?["`]?([A-Za-z0-9_]+)["`]?$/i);
        const colLabel = aliasMatch ? aliasMatch[1] : p.trim();
        columns.push(colLabel);

        if (/COUNT\s*\(\s*\*\s*\)/i.test(p)) {
          aggRow.push(dataset.length);
        } else if (/SUM\s*\(\s*([A-Za-z0-9_.]+)\s*\)/i.test(p)) {
          const m = p.match(/SUM\s*\(\s*([A-Za-z0-9_.]+)\s*\)/i)!;
          const col = m[1].includes('.') ? m[1].split('.')[1] : m[1];
          const sum = dataset.reduce((acc, r) => acc + (Number(r[col]) || 0), 0);
          aggRow.push(sum);
        } else if (/AVG\s*\(\s*([A-Za-z0-9_.]+)\s*\)/i.test(p)) {
          const m = p.match(/AVG\s*\(\s*([A-Za-z0-9_.]+)\s*\)/i)!;
          const col = m[1].includes('.') ? m[1].split('.')[1] : m[1];
          const sum = dataset.reduce((acc, r) => acc + (Number(r[col]) || 0), 0);
          aggRow.push(dataset.length > 0 ? Number((sum / dataset.length).toFixed(2)) : 0);
        } else {
          aggRow.push(null);
        }
      }
      return {
        columns,
        rows: [aggRow],
        rowCount: 1,
        executionTimeMs: 0,
      };
    }

    for (const p of projList) {
      const asMatch = p.match(/(.+?)\s+AS\s+["`]?([A-Za-z0-9_]+)["`]?$/i);
      const expr = (asMatch ? asMatch[1] : p).trim();
      const alias = (asMatch ? asMatch[2] : expr).replace(/["`]/g, '').trim();
      const colOnly = alias.includes('.') ? alias.split('.')[1] : alias;
      columns.push(colOnly);

      const rawCol = expr.includes('.') ? expr.split('.')[1] : expr;
      getters.push((row) => row[rawCol] ?? null);
    }

    const rows = dataset.map((row) => getters.map((g) => g(row)));
    return {
      columns,
      rows,
      rowCount: rows.length,
      executionTimeMs: 0,
    };
  }

  private evaluateWhere(row: Record<string, any>, cond: string): boolean {
    // Support common conditions: col = 'val', col != 'val', col > num, col IS NOT NULL
    if (/IS\s+NOT\s+NULL/i.test(cond)) {
      const col = cond.replace(/\s+IS\s+NOT\s+NULL/i, '').trim().split('.').pop()!;
      return row[col] != null;
    }
    if (/IS\s+NULL/i.test(cond)) {
      const col = cond.replace(/\s+IS\s+NULL/i, '').trim().split('.').pop()!;
      return row[col] == null;
    }
    const eqMatch = cond.match(/([A-Za-z0-9_.]+)\s*(=|!=|<>|>|<|>=|<=)\s*(.+)/);
    if (eqMatch) {
      const col = eqMatch[1].split('.').pop()!;
      const op = eqMatch[2];
      const targetVal = this.parseLiteralValue(eqMatch[3].trim());
      const rowVal = row[col];

      if (op === '=') return rowVal == targetVal;
      if (op === '!=' || op === '<>') return rowVal != targetVal;
      if (op === '>') return Number(rowVal) > Number(targetVal);
      if (op === '<') return Number(rowVal) < Number(targetVal);
      if (op === '>=') return Number(rowVal) >= Number(targetVal);
      if (op === '<=') return Number(rowVal) <= Number(targetVal);
    }
    return true;
  }
}

/**
 * Generates realistic mock seed rows (INSERT INTO ...) for all tables in a DDL schema string.
 */
export function generateRealisticSeedData(schemaDdl: string): string {
  const parsed = parseSqlDdl(schemaDdl);
  const entities = parsed.diagram.entities;
  if (!entities || entities.length === 0) {
    return '-- No CREATE TABLE schemas found to seed.';
  }

  const insertStatements: string[] = ['-- AI Generated Realistic Seed Data (5 rows per table)'];

  // Keep a map of generated Primary Keys so Foreign Keys point to real valid parent rows
  const generatedPks: Record<string, (string | number)[]> = {};

  const FIRST_NAMES = ['Aria', 'Mateo', 'Zoe', 'Liam', 'Elena', 'Kaito', 'Sophia', 'Marcus'];
  const LAST_NAMES = ['Vance', 'Chen', 'Patel', 'Novak', 'Kim', 'O\'Connor', 'Alvarez', 'Singh'];
  const CITIES = ['San Francisco', 'New York', 'Tokyo', 'London', 'Berlin', 'Toronto', 'Bengaluru'];
  const STATUSES = ['active', 'pending', 'completed', 'verified', 'archived'];
  const CATEGORIES = ['Engineering', 'Design', 'Marketing', 'Data Analytics', 'DevOps'];

  for (const entity of entities) {
    const tableName = entity.name;
    generatedPks[tableName] = [];

    const rows: string[] = [];
    for (let i = 0; i < 5; i++) {
      const rowVals: string[] = [];

      for (const col of entity.columns) {
        const colLower = col.name.toLowerCase();
        const typeLower = col.type.toLowerCase();

        // 1. Primary Keys
        if (col.isPrimaryKey) {
          if (typeLower.includes('int') || typeLower.includes('serial')) {
            const pkVal = i + 1;
            generatedPks[tableName].push(pkVal);
            rowVals.push(String(pkVal));
          } else {
            // UUID or string PK
            const pkVal = `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
            generatedPks[tableName].push(`'${pkVal}'`);
            rowVals.push(`'${pkVal}'`);
          }
          continue;
        }

        // 2. Foreign Keys
        if (col.isForeignKey || colLower.endsWith('_id')) {
          // Look for parent table
          const targetTable = Object.keys(generatedPks).find(
            (t) => t !== tableName && colLower.includes(t.slice(0, -1))
          );
          if (targetTable && generatedPks[targetTable]?.length > 0) {
            const parentPks = generatedPks[targetTable];
            rowVals.push(String(parentPks[i % parentPks.length]));
          } else {
            rowVals.push(typeLower.includes('int') ? String(i + 1) : `'00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}'`);
          }
          continue;
        }

        // 3. Realistic Attributes
        if (colLower.includes('email')) {
          rowVals.push(`'${FIRST_NAMES[i].toLowerCase()}.${LAST_NAMES[i].toLowerCase()}@example.com'`);
        } else if (colLower.includes('name')) {
          rowVals.push(`'${FIRST_NAMES[i]} ${LAST_NAMES[i]}'`);
        } else if (colLower.includes('title')) {
          rowVals.push(`'Senior Database Architect #${i + 1}'`);
        } else if (colLower.includes('city') || colLower.includes('location')) {
          rowVals.push(`'${CITIES[i % CITIES.length]}'`);
        } else if (colLower.includes('status')) {
          rowVals.push(`'${STATUSES[i % STATUSES.length]}'`);
        } else if (colLower.includes('category') || colLower.includes('department')) {
          rowVals.push(`'${CATEGORIES[i % CATEGORIES.length]}'`);
        } else if (colLower.includes('price') || colLower.includes('amount') || colLower.includes('salary') || colLower.includes('total')) {
          rowVals.push(String(Math.round((i + 1) * 249.5)));
        } else if (colLower.includes('quantity') || colLower.includes('count')) {
          rowVals.push(String((i + 1) * 3));
        } else if (colLower.includes('date') || colLower.includes('time') || colLower.includes('at')) {
          rowVals.push(`'2026-0${i + 1}-15 10:30:00'`);
        } else if (colLower.includes('is_') || colLower.includes('has_') || typeLower.includes('bool')) {
          rowVals.push(i % 2 === 0 ? 'TRUE' : 'FALSE');
        } else if (typeLower.includes('int') || typeLower.includes('numeric') || typeLower.includes('decimal')) {
          rowVals.push(String((i + 1) * 10));
        } else {
          rowVals.push(`'sample_${col.name}_${i + 1}'`);
        }
      }

      rows.push(`  (${rowVals.join(', ')})`);
    }

    const colNames = entity.columns.map((c) => c.name).join(', ');
    insertStatements.push(
      `INSERT INTO ${tableName} (${colNames}) VALUES\n${rows.join(',\n')};`
    );
  }

  return insertStatements.join('\n\n');
}
