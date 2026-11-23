import type { ERColumn, ERDiagramData, EREntity, ERRelationship } from '../types/nova';

export type SchemaIssueSeverity = 'Critical' | 'Warning' | 'Suggestion';

export interface SchemaDebugIssue {
  id: string;
  severity: SchemaIssueSeverity;
  table: string;
  column?: string;
  title: string;
  detail: string;
  suggestion: string;
}

export interface ParsedIndex {
  name: string;
  table: string;
  columns: string[];
  isUnique: boolean;
}

export interface DdlParseResult {
  diagram: ERDiagramData;
  mermaidCode: string;
  indexes: ParsedIndex[];
  issues: SchemaDebugIssue[];
  parseErrors: string[];
  stats: {
    tableCount: number;
    columnCount: number;
    relationshipCount: number;
    indexCount: number;
    criticalCount: number;
    warningCount: number;
  };
}

interface RawForeignKey {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  constraintName?: string;
  onDelete?: string;
}

function stripIdentifierQuotes(raw: string): string {
  const trimmed = raw.trim();
  // Handle schema.table -> take table name while preserving readability
  const segments = trimmed.split('.').map((part) => {
    const p = part.trim();
    if (
      (p.startsWith('"') && p.endsWith('"')) ||
      (p.startsWith('`') && p.endsWith('`')) ||
      (p.startsWith('[') && p.endsWith(']'))
    ) {
      return p.slice(1, -1);
    }
    return p;
  });
  return segments[segments.length - 1] ?? trimmed;
}

/**
 * Strips SQL comments (-- ... and /* ... *\/) while preserving string literals.
 */
export function stripSqlComments(sql: string): string {
  let out = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inSingle) {
      out += ch;
      if (ch === "'" && next === "'") {
        out += next;
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i += 1;
      continue;
    }

    if (inDouble) {
      out += ch;
      if (ch === '"' && next === '"') {
        out += next;
        i += 2;
        continue;
      }
      if (ch === '"') inDouble = false;
      i += 1;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inDouble = true;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) {
        if (sql[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

/**
 * Splits a comma-separated SQL body at top-level parentheses and outside string literals.
 */
export function splitTopLevelCommas(body: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    const next = body[i + 1];

    if (inSingle) {
      current += ch;
      if (ch === "'" && next === "'") {
        current += next;
        i += 1;
      } else if (ch === "'") {
        inSingle = false;
      }
      continue;
    }

    if (inDouble) {
      current += ch;
      if (ch === '"' && next === '"') {
        current += next;
        i += 1;
      } else if (ch === '"') {
        inDouble = false;
      }
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      current += ch;
      continue;
    }

    if (ch === '"') {
      inDouble = true;
      current += ch;
      continue;
    }

    if (ch === '(') {
      depth += 1;
      current += ch;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
      current += ch;
    } else if (ch === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Finds the matching closing parenthesis index for an opening '(' at startIdx.
 */
function findMatchingParen(sql: string, startIdx: number): number {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;

  for (let i = startIdx; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inSingle) {
      if (ch === "'" && next === "'") {
        i += 1;
      } else if (ch === "'") {
        inSingle = false;
      }
      continue;
    }

    if (inDouble) {
      if (ch === '"' && next === '"') {
        i += 1;
      } else if (ch === '"') {
        inDouble = false;
      }
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      continue;
    }

    if (ch === '"') {
      inDouble = true;
      continue;
    }

    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function normalizeSqlTypeFamily(rawType: string): string {
  const upper = rawType.toUpperCase().replace(/\s+/g, ' ').trim();
  const base = upper.split('(')[0].trim();

  if (['SERIAL', 'INT', 'INT4', 'INTEGER', 'MEDIUMINT', 'SMALLINT', 'TINYINT', 'SMALLSERIAL'].includes(base)) {
    return 'INT';
  }
  if (['BIGSERIAL', 'BIGINT', 'INT8'].includes(base)) {
    return 'BIGINT';
  }
  if (['UUID', 'UNIQUEIDENTIFIER'].includes(base)) {
    return 'UUID';
  }
  if (['VARCHAR', 'CHARACTER VARYING', 'NVARCHAR', 'TEXT', 'CHAR', 'CHARACTER', 'BPCHAR', 'CITEXT'].includes(base)) {
    return 'STRING';
  }
  if (['NUMERIC', 'DECIMAL', 'MONEY', 'FLOAT', 'FLOAT4', 'FLOAT8', 'DOUBLE', 'DOUBLE PRECISION', 'REAL'].includes(base)) {
    return 'NUMERIC';
  }
  if (['TIMESTAMP', 'TIMESTAMPTZ', 'TIMESTAMP WITH TIME ZONE', 'TIMESTAMP WITHOUT TIME ZONE', 'DATETIME', 'DATETIME2'].includes(base)) {
    return 'TIMESTAMP';
  }
  if (['BOOL', 'BOOLEAN'].includes(base)) {
    return 'BOOLEAN';
  }
  if (['JSON', 'JSONB'].includes(base)) {
    return 'JSON';
  }
  return base;
}

function sanitizeMermaidIdent(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, '_');
  if (!cleaned) return 'col';
  return /^[0-9]/.test(cleaned) ? `t_${cleaned}` : cleaned;
}

function sanitizeMermaidType(rawType: string): string {
  const compact = rawType
    .trim()
    .replace(/\s+/g, '_')
    .replace(/\(([^)]*)\)/g, '_$1')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return compact || 'TEXT';
}

function extractColumnType(rest: string): string {
  // Read the data type up to the first SQL column constraint keyword
  const constraintRe =
    /\b(PRIMARY\s+KEY|NOT\s+NULL|NULL|UNIQUE|DEFAULT|REFERENCES|CHECK|CONSTRAINT|GENERATED|AUTO_INCREMENT|AUTOINCREMENT|COLLATE|COMMENT|ON\s+UPDATE)\b/i;
  const match = constraintRe.exec(rest);
  const rawType = (match ? rest.slice(0, match.index) : rest).trim();
  return rawType.replace(/\s+/g, ' ') || 'TEXT';
}

/**
 * Parses SQL DDL statements (CREATE TABLE, ALTER TABLE ADD CONSTRAINT/FOREIGN KEY/PRIMARY KEY,
 * CREATE [UNIQUE] INDEX) into structured ERDiagramData, valid Mermaid erDiagram code,
 * and actionable schema debugging diagnostics.
 */
export function parseSqlDdl(ddl: string): DdlParseResult {
  const cleaned = stripSqlComments(ddl || '').trim();
  const entities: EREntity[] = [];
  const entityMap = new Map<string, EREntity>();
  const rawForeignKeys: RawForeignKey[] = [];
  const indexes: ParsedIndex[] = [];
  const issues: SchemaDebugIssue[] = [];
  const parseErrors: string[] = [];

  if (!cleaned) {
    return {
      diagram: { title: 'Schema ER Diagram', entities: [], relationships: [] },
      mermaidCode: '',
      indexes: [],
      issues: [],
      parseErrors: [],
      stats: {
        tableCount: 0,
        columnCount: 0,
        relationshipCount: 0,
        indexCount: 0,
        criticalCount: 0,
        warningCount: 0,
      },
    };
  }

  // 1. Parse CREATE TABLE statements
  const createTableRe =
    /\bCREATE\s+(?:(?:GLOBAL\s+|LOCAL\s+)?(?:TEMP|TEMPORARY|UNLOGGED)\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:["`\[]?[A-Za-z_][A-Za-z0-9_]*["`\]]?\.)?["`\[]?[A-Za-z_][A-Za-z0-9_]*["`\]]?)\s*\(/gi;

  let match: RegExpExecArray | null;
  while ((match = createTableRe.exec(cleaned)) !== null) {
    const rawTableName = match[1];
    const tableName = stripIdentifierQuotes(rawTableName);
    const openParenIdx = match.index + match[0].length - 1;
    const closeParenIdx = findMatchingParen(cleaned, openParenIdx);

    if (closeParenIdx === -1) {
      const errMsg = `Unclosed parenthesis in CREATE TABLE "${tableName}". Check that every "(" has a matching ")".`;
      parseErrors.push(errMsg);
      issues.push({
        id: `unclosed-${tableName}`,
        severity: 'Critical',
        table: tableName,
        title: `Unclosed CREATE TABLE block for "${tableName}"`,
        detail: errMsg,
        suggestion: `Add a closing ");" at the end of the "${tableName}" table definition.`,
      });
      break;
    }

    const body = cleaned.slice(openParenIdx + 1, closeParenIdx);
    const items = splitTopLevelCommas(body);
    const columns: ERColumn[] = [];
    const seenCols = new Set<string>();
    const tablePks = new Set<string>();
    const tableUniques = new Set<string>();

    if (entityMap.has(tableName.toLowerCase())) {
      issues.push({
        id: `dup-table-${tableName.toLowerCase()}`,
        severity: 'Critical',
        table: tableName,
        title: `Duplicate table definition "${tableName}"`,
        detail: `Table "${tableName}" is declared more than once in this DDL script.`,
        suggestion: `Merge the definitions or drop/rename the duplicate CREATE TABLE "${tableName}" statement.`,
      });
    }

    for (const rawItem of items) {
      const item = rawItem.trim();
      if (!item) continue;

      // Table-level CONSTRAINT ... or PRIMARY KEY / FOREIGN KEY / UNIQUE / CHECK / INDEX
      const isTableConstraint =
        /^(?:CONSTRAINT\s+["`\[]?[A-Za-z0-9_]+["`\]]?\s+)?(?:PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE(?:\s+KEY|\s+INDEX)?|CHECK|KEY|INDEX)\b/i.test(
          item
        );

      if (isTableConstraint) {
        const pkMatch = /\bPRIMARY\s+KEY\s*\(([^)]+)\)/i.exec(item);
        if (pkMatch) {
          for (const col of pkMatch[1].split(',')) {
            tablePks.add(stripIdentifierQuotes(col).toLowerCase());
          }
          continue;
        }

        const fkMatch =
          /(?:CONSTRAINT\s+(["`\[]?[A-Za-z0-9_]+["`\]]?)\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+((?:["`\[]?[A-Za-z0-9_]+["`\]]?\.)?["`\[]?[A-Za-z0-9_]+["`\]]?)\s*(?:\(([^)]+)\))?(?:\s+ON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION))?/i.exec(
            item
          );
        if (fkMatch) {
          const constraintName = fkMatch[1] ? stripIdentifierQuotes(fkMatch[1]) : undefined;
          const fromCols = fkMatch[2].split(',').map((c) => stripIdentifierQuotes(c));
          const toTable = stripIdentifierQuotes(fkMatch[3]);
          const toCols = fkMatch[4]
            ? fkMatch[4].split(',').map((c) => stripIdentifierQuotes(c))
            : ['id'];
          const onDelete = fkMatch[5]?.toUpperCase();

          fromCols.forEach((fc, idx) => {
            rawForeignKeys.push({
              fromTable: tableName,
              fromColumn: fc,
              toTable,
              toColumn: toCols[idx] ?? toCols[0] ?? 'id',
              constraintName,
              onDelete,
            });
          });
          continue;
        }

        const uqMatch = /\bUNIQUE(?:\s+KEY|\s+INDEX)?(?:\s+["`\[]?[A-Za-z0-9_]+["`\]]?)?\s*\(([^)]+)\)/i.exec(
          item
        );
        if (uqMatch) {
          const uqCols = uqMatch[1].split(',').map((c) => stripIdentifierQuotes(c));
          if (uqCols.length === 1) {
            tableUniques.add(uqCols[0].toLowerCase());
          }
          indexes.push({
            name: `uq_${tableName}_${uqCols.join('_')}`,
            table: tableName,
            columns: uqCols,
            isUnique: true,
          });
          continue;
        }

        const keyMatch = /^(?:KEY|INDEX)\s+(["`\[]?[A-Za-z0-9_]+["`\]]?)?\s*\(([^)]+)\)/i.exec(item);
        if (keyMatch) {
          const idxCols = keyMatch[2].split(',').map((c) => stripIdentifierQuotes(c.split(/\s+/)[0]));
          indexes.push({
            name: keyMatch[1] ? stripIdentifierQuotes(keyMatch[1]) : `idx_${tableName}_${idxCols.join('_')}`,
            table: tableName,
            columns: idxCols,
            isUnique: false,
          });
          continue;
        }

        continue;
      }

      // Column definition: <col_name> <type...> [constraints...]
      const colMatch = /^(["`\[]?[A-Za-z_][A-Za-z0-9_]*["`\]]?)\s+([\s\S]+)$/.exec(item);
      if (!colMatch) continue;

      const colName = stripIdentifierQuotes(colMatch[1]);
      const rest = colMatch[2].trim();
      const colType = extractColumnType(rest);

      if (seenCols.has(colName.toLowerCase())) {
        issues.push({
          id: `dup-col-${tableName.toLowerCase()}-${colName.toLowerCase()}`,
          severity: 'Critical',
          table: tableName,
          column: colName,
          title: `Duplicate column "${colName}" in "${tableName}"`,
          detail: `Column "${colName}" is defined multiple times inside table "${tableName}".`,
          suggestion: `Remove or rename the duplicate "${colName}" column definition.`,
        });
        continue;
      }
      seenCols.add(colName.toLowerCase());

      const isPrimaryKey = /\bPRIMARY\s+KEY\b/i.test(rest);
      const isUnique = /\bUNIQUE\b/i.test(rest);
      const isNotNull = /\bNOT\s+NULL\b/i.test(rest) || isPrimaryKey;

      const inlineRefMatch =
        /\bREFERENCES\s+((?:["`\[]?[A-Za-z0-9_]+["`\]]?\.)?["`\[]?[A-Za-z0-9_]+["`\]]?)\s*(?:\(([^)]+)\))?(?:\s+ON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION))?/i.exec(
          rest
        );

      let isForeignKey = false;
      let references: string | undefined;

      if (inlineRefMatch) {
        const toTable = stripIdentifierQuotes(inlineRefMatch[1]);
        const toCol = inlineRefMatch[2]
          ? stripIdentifierQuotes(inlineRefMatch[2].split(',')[0])
          : 'id';
        isForeignKey = true;
        references = `${toTable}.${toCol}`;
        rawForeignKeys.push({
          fromTable: tableName,
          fromColumn: colName,
          toTable,
          toColumn: toCol,
          onDelete: inlineRefMatch[3]?.toUpperCase(),
        });
      }

      columns.push({
        name: colName,
        type: colType,
        isPrimaryKey,
        isForeignKey,
        isUnique,
        isNullable: !isNotNull,
        references,
      });
    }

    // Apply table-level PK and UNIQUE flags
    for (const col of columns) {
      if (tablePks.has(col.name.toLowerCase())) {
        col.isPrimaryKey = true;
        col.isNullable = false;
      }
      if (tableUniques.has(col.name.toLowerCase())) {
        col.isUnique = true;
      }
    }

    const entity: EREntity = {
      id: tableName.toLowerCase(),
      name: tableName,
      columns,
    };

    if (!entityMap.has(tableName.toLowerCase())) {
      entities.push(entity);
      entityMap.set(tableName.toLowerCase(), entity);
    }

    // Advance regex past the closing paren of this table
    createTableRe.lastIndex = closeParenIdx + 1;
  }

  // 2. Parse ALTER TABLE ... ADD [CONSTRAINT ...] FOREIGN KEY / PRIMARY KEY
  const alterFkRe =
    /\bALTER\s+TABLE\s+(?:ONLY\s+)?((?:["`\[]?[A-Za-z0-9_]+["`\]]?\.)?["`\[]?[A-Za-z0-9_]+["`\]]?)\s+ADD\s+(?:CONSTRAINT\s+(["`\[]?[A-Za-z0-9_]+["`\]]?)\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+((?:["`\[]?[A-Za-z0-9_]+["`\]]?\.)?["`\[]?[A-Za-z0-9_]+["`\]]?)\s*(?:\(([^)]+)\))?(?:\s+ON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION))?/gi;

  while ((match = alterFkRe.exec(cleaned)) !== null) {
    const fromTable = stripIdentifierQuotes(match[1]);
    const constraintName = match[2] ? stripIdentifierQuotes(match[2]) : undefined;
    const fromCols = match[3].split(',').map((c) => stripIdentifierQuotes(c));
    const toTable = stripIdentifierQuotes(match[4]);
    const toCols = match[5] ? match[5].split(',').map((c) => stripIdentifierQuotes(c)) : ['id'];
    const onDelete = match[6]?.toUpperCase();

    fromCols.forEach((fc, idx) => {
      rawForeignKeys.push({
        fromTable,
        fromColumn: fc,
        toTable,
        toColumn: toCols[idx] ?? toCols[0] ?? 'id',
        constraintName,
        onDelete,
      });
    });
  }

  const alterPkRe =
    /\bALTER\s+TABLE\s+(?:ONLY\s+)?((?:["`\[]?[A-Za-z0-9_]+["`\]]?\.)?["`\[]?[A-Za-z0-9_]+["`\]]?)\s+ADD\s+(?:CONSTRAINT\s+["`\[]?[A-Za-z0-9_]+["`\]]?\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)/gi;

  while ((match = alterPkRe.exec(cleaned)) !== null) {
    const tableName = stripIdentifierQuotes(match[1]);
    const entity = entityMap.get(tableName.toLowerCase());
    if (!entity) continue;
    const pkCols = new Set(match[2].split(',').map((c) => stripIdentifierQuotes(c).toLowerCase()));
    for (const col of entity.columns) {
      if (pkCols.has(col.name.toLowerCase())) {
        col.isPrimaryKey = true;
        col.isNullable = false;
      }
    }
  }

  // 3. Parse CREATE [UNIQUE] INDEX statements
  const createIndexRe =
    /\bCREATE\s+(UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(["`\[]?[A-Za-z0-9_]+["`\]]?)\s+ON\s+((?:["`\[]?[A-Za-z0-9_]+["`\]]?\.)?["`\[]?[A-Za-z0-9_]+["`\]]?)\s*(?:USING\s+[A-Za-z0-9_]+\s*)?\(([^)]+)\)/gi;

  while ((match = createIndexRe.exec(cleaned)) !== null) {
    const isUnique = Boolean(match[1]);
    const idxName = stripIdentifierQuotes(match[2]);
    const tableName = stripIdentifierQuotes(match[3]);
    const cols = match[4]
      .split(',')
      .map((c) => stripIdentifierQuotes(c.trim().split(/\s+/)[0]));

    indexes.push({
      name: idxName,
      table: tableName,
      columns: cols,
      isUnique,
    });
  }

  // 4. Resolve Foreign Keys into ERRelationship[] & Run Referential Debugging
  const relationships: ERRelationship[] = [];
  const dedupRel = new Set<string>();

  rawForeignKeys.forEach((fk, idx) => {
    const fromEntity = entityMap.get(fk.fromTable.toLowerCase());
    const toEntity = entityMap.get(fk.toTable.toLowerCase());

    if (!fromEntity) {
      issues.push({
        id: `fk-missing-source-${idx}`,
        severity: 'Critical',
        table: fk.fromTable,
        column: fk.fromColumn,
        title: `ALTER TABLE references unknown table "${fk.fromTable}"`,
        detail: `Foreign key on "${fk.fromTable}.${fk.fromColumn}" targets "${fk.toTable}.${fk.toColumn}", but "${fk.fromTable}" is not defined.`,
        suggestion: `Define CREATE TABLE ${fk.fromTable} before adding the foreign key constraint.`,
      });
      return;
    }

    const fromCol = fromEntity.columns.find(
      (c) => c.name.toLowerCase() === fk.fromColumn.toLowerCase()
    );

    if (!fromCol) {
      issues.push({
        id: `fk-missing-fromcol-${fromEntity.name}-${fk.fromColumn}`,
        severity: 'Critical',
        table: fromEntity.name,
        column: fk.fromColumn,
        title: `Foreign key column "${fk.fromColumn}" not found in "${fromEntity.name}"`,
        detail: `Table "${fromEntity.name}" declares a FOREIGN KEY on "${fk.fromColumn}", but no such column exists.`,
        suggestion: `Add column "${fk.fromColumn}" to "${fromEntity.name}" or fix the column name typo.`,
      });
    } else {
      fromCol.isForeignKey = true;
      fromCol.references = `${fk.toTable}.${fk.toColumn}`;
    }

    if (!toEntity) {
      issues.push({
        id: `fk-dangling-table-${fromEntity.name}-${fk.toTable}`,
        severity: 'Critical',
        table: fromEntity.name,
        column: fk.fromColumn,
        title: `Broken foreign key target table "${fk.toTable}"`,
        detail: `"${fromEntity.name}.${fk.fromColumn}" references "${fk.toTable}(${fk.toColumn})", but table "${fk.toTable}" is missing from the schema.`,
        suggestion: `Add a CREATE TABLE ${fk.toTable} definition or correct the referenced table name.`,
      });
      return;
    }

    const toCol = toEntity.columns.find(
      (c) => c.name.toLowerCase() === fk.toColumn.toLowerCase()
    );

    if (!toCol) {
      issues.push({
        id: `fk-dangling-col-${fromEntity.name}-${fk.toTable}-${fk.toColumn}`,
        severity: 'Critical',
        table: fromEntity.name,
        column: fk.fromColumn,
        title: `Referenced column "${fk.toTable}.${fk.toColumn}" does not exist`,
        detail: `"${fromEntity.name}.${fk.fromColumn}" points to "${fk.toTable}.${fk.toColumn}", which is not declared in "${fk.toTable}".`,
        suggestion: `Reference "${toEntity.name}(${toEntity.columns.find((c) => c.isPrimaryKey)?.name ?? 'id'})" or add "${fk.toColumn}" to "${toEntity.name}".`,
      });
    } else {
      // Check data type compatibility between FK column and referenced column
      if (fromCol) {
        const fromFamily = normalizeSqlTypeFamily(fromCol.type);
        const toFamily = normalizeSqlTypeFamily(toCol.type);
        if (fromFamily !== toFamily) {
          issues.push({
            id: `fk-type-mismatch-${fromEntity.name}-${fromCol.name}`,
            severity: 'Warning',
            table: fromEntity.name,
            column: fromCol.name,
            title: `Foreign key type mismatch (${fromCol.type} → ${toCol.type})`,
            detail: `"${fromEntity.name}.${fromCol.name}" is ${fromCol.type}, while referenced "${toEntity.name}.${toCol.name}" is ${toCol.type}. Most engines reject this constraint or fail to use indexes on joins.`,
            suggestion: `Change "${fromEntity.name}.${fromCol.name}" to ${toCol.type} to match "${toEntity.name}.${toCol.name}".`,
          });
        }
      }

      // Check referenced column is PK or UNIQUE
      if (!toCol.isPrimaryKey && !toCol.isUnique) {
        issues.push({
          id: `fk-non-unique-target-${fromEntity.name}-${toEntity.name}-${toCol.name}`,
          severity: 'Warning',
          table: toEntity.name,
          column: toCol.name,
          title: `FK target "${toEntity.name}.${toCol.name}" is not PRIMARY KEY or UNIQUE`,
          detail: `Foreign keys must reference a PRIMARY KEY or UNIQUE column to guarantee deterministic joins and referential integrity.`,
          suggestion: `Mark "${toEntity.name}.${toCol.name}" as PRIMARY KEY or add a UNIQUE constraint.`,
        });
      }
    }

    const relKey = `${fromEntity.name.toLowerCase()}.${fk.fromColumn.toLowerCase()}->${toEntity.name.toLowerCase()}.${fk.toColumn.toLowerCase()}`;
    if (!dedupRel.has(relKey)) {
      dedupRel.add(relKey);
      const isOneToOne = Boolean(fromCol?.isUnique || (fromCol?.isPrimaryKey && fromEntity.columns.filter((c) => c.isPrimaryKey).length === 1));
      relationships.push({
        id: `rel-${relationships.length + 1}`,
        fromEntity: fromEntity.name,
        fromColumn: fk.fromColumn,
        toEntity: toEntity.name,
        toColumn: fk.toColumn,
        cardinality: isOneToOne ? '1:1' : 'N:1',
        label: fk.constraintName || fk.fromColumn,
      });
    }
  });

  // 5. Table-level Schema Debugging Rules (Missing PK, Unindexed FK, Orphan Tables)
  const connectedTables = new Set<string>();
  for (const rel of relationships) {
    connectedTables.add(rel.fromEntity.toLowerCase());
    connectedTables.add(rel.toEntity.toLowerCase());
  }

  for (const entity of entities) {
    const pkCols = entity.columns.filter((c) => c.isPrimaryKey);
    if (pkCols.length === 0) {
      issues.push({
        id: `no-pk-${entity.name.toLowerCase()}`,
        severity: 'Warning',
        table: entity.name,
        title: `Table "${entity.name}" has no PRIMARY KEY`,
        detail: `Without a primary key, rows cannot be uniquely addressed, replication degrades, and duplicate records can accumulate silently.`,
        suggestion: `Add an "id UUID PRIMARY KEY" (or composite PRIMARY KEY) to "${entity.name}".`,
      });
    }

    // Check unindexed foreign keys
    const tableIndexes = indexes.filter(
      (idx) => idx.table.toLowerCase() === entity.name.toLowerCase()
    );
    for (const col of entity.columns) {
      if (!col.isForeignKey) continue;
      const coveredByPk = col.isPrimaryKey && (pkCols.length === 1 || pkCols[0]?.name === col.name);
      const coveredByUnique = Boolean(col.isUnique);
      const coveredByIndex = tableIndexes.some(
        (idx) => idx.columns[0]?.toLowerCase() === col.name.toLowerCase()
      );
      if (!coveredByPk && !coveredByUnique && !coveredByIndex) {
        issues.push({
          id: `unindexed-fk-${entity.name.toLowerCase()}-${col.name.toLowerCase()}`,
          severity: 'Suggestion',
          table: entity.name,
          column: col.name,
          title: `Unindexed foreign key "${entity.name}.${col.name}"`,
          detail: `PostgreSQL and SQLite do not auto-index foreign keys. Parent deletes and child lookups on "${col.name}" can trigger sequential scans.`,
          suggestion: `CREATE INDEX idx_${entity.name}_${col.name} ON ${entity.name} (${col.name});`,
        });
      }
    }

    if (entities.length > 1 && !connectedTables.has(entity.name.toLowerCase())) {
      issues.push({
        id: `orphan-table-${entity.name.toLowerCase()}`,
        severity: 'Suggestion',
        table: entity.name,
        title: `Disconnected table "${entity.name}"`,
        detail: `"${entity.name}" has no incoming or outgoing FOREIGN KEY relationships with other tables in this schema.`,
        suggestion: `Verify whether "${entity.name}" should link to another entity via REFERENCES or an ALTER TABLE FOREIGN KEY.`,
      });
    }
  }

  if (entities.length === 0 && parseErrors.length === 0) {
    parseErrors.push(
      'No CREATE TABLE statements were found. Paste one or more SQL CREATE TABLE definitions to render an ER diagram.'
    );
  }

  // Sort issues: Critical -> Warning -> Suggestion
  const severityRank: Record<SchemaIssueSeverity, number> = {
    Critical: 0,
    Warning: 1,
    Suggestion: 2,
  };
  issues.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  const diagram: ERDiagramData = {
    title: entities.length > 0 ? `Parsed Schema (${entities.length} ${entities.length === 1 ? 'Table' : 'Tables'})` : 'Schema ER Diagram',
    summary: `${entities.length} tables · ${relationships.length} relationships · ${issues.length} diagnostics`,
    entities,
    relationships,
  };

  const mermaidCode = buildMermaidErCode(diagram);
  const columnCount = entities.reduce((acc, e) => acc + e.columns.length, 0);

  return {
    diagram,
    mermaidCode,
    indexes,
    issues,
    parseErrors,
    stats: {
      tableCount: entities.length,
      columnCount,
      relationshipCount: relationships.length,
      indexCount: indexes.length,
      criticalCount: issues.filter((i) => i.severity === 'Critical').length,
      warningCount: issues.filter((i) => i.severity === 'Warning').length,
    },
  };
}

/**
 * Generates strictly valid Mermaid.js erDiagram syntax from ERDiagramData.
 */
export function buildMermaidErCode(diagram: ERDiagramData): string {
  if (!diagram.entities || diagram.entities.length === 0) return '';

  const lines: string[] = ['erDiagram'];

  for (const entity of diagram.entities) {
    const entityId = sanitizeMermaidIdent(entity.name);
    lines.push(`  ${entityId} {`);
    if (entity.columns.length === 0) {
      lines.push('    TEXT placeholder_col');
    } else {
      for (const col of entity.columns) {
        const typeToken = sanitizeMermaidType(col.type);
        const colName = sanitizeMermaidIdent(col.name);
        const keys: string[] = [];
        if (col.isPrimaryKey) keys.push('PK');
        if (col.isForeignKey) keys.push('FK');
        if (col.isUnique && !col.isPrimaryKey) keys.push('UK');
        const keyPart = keys.length > 0 ? ` ${keys.join(',')}` : '';
        const commentPart = col.isNullable ? ' "NULL"' : ' "NOT NULL"';
        lines.push(`    ${typeToken} ${colName}${keyPart}${commentPart}`);
      }
    }
    lines.push('  }');
  }

  const cardMap: Record<ERRelationship['cardinality'], string> = {
    '1:1': '||--||',
    '1:N': '||--o{',
    'N:1': '}o--||',
    'N:M': '}o--o{',
  };

  for (const rel of diagram.relationships) {
    const fromId = sanitizeMermaidIdent(rel.fromEntity);
    const toId = sanitizeMermaidIdent(rel.toEntity);
    const connector = cardMap[rel.cardinality] ?? '}o--||';
    const rawLabel = rel.label || `${rel.fromColumn} -> ${rel.toColumn}`;
    const safeLabel = rawLabel.replace(/"/g, "'").replace(/\s+/g, ' ').trim();
    lines.push(`  ${fromId} ${connector} ${toId} : "${safeLabel}"`);
  }

  return lines.join('\n');
}

export const BROKEN_DEBUG_SCHEMA_DDL = `CREATE TABLE customers (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  tier VARCHAR(32) NOT NULL
);

CREATE TABLE orders (
  id UUID PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  total_cents BIGINT NOT NULL
);

CREATE TABLE audit_logs (
  event_type VARCHAR(64) NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_orders_total ON orders (total_cents);`;
