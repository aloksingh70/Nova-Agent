import type { ERColumn, ERRelationship, SqlDialect } from '../types/nova';
import { parseSqlDdl } from './sqlDdlParser';

export type DiffStatus = 'added' | 'removed' | 'modified' | 'unchanged';

export interface ColumnDiff {
  name: string;
  status: DiffStatus;
  before?: ERColumn;
  after?: ERColumn;
  changes: string[];
}

export interface TableDiff {
  name: string;
  status: DiffStatus;
  columns: ColumnDiff[];
  addedColumnCount: number;
  removedColumnCount: number;
  modifiedColumnCount: number;
}

export interface ForeignKeyDiff {
  key: string;
  status: DiffStatus;
  fromEntity: string;
  fromColumn: string;
  toEntity: string;
  toColumn: string;
  cardinality: ERRelationship['cardinality'];
  previousTarget?: string;
}

export interface SchemaDiffResult {
  tables: TableDiff[];
  foreignKeys: ForeignKeyDiff[];
  tableStatusMap: Record<string, DiffStatus>;
  mergedMermaidCode: string;
  migrationSql: string;
  summary: {
    tablesAdded: number;
    tablesRemoved: number;
    tablesModified: number;
    tablesUnchanged: number;
    fksAdded: number;
    fksRemoved: number;
    fksModified: number;
    totalChanges: number;
  };
}

export interface SchemaDiffPreset {
  id: string;
  name: string;
  description: string;
  baseDdl: string;
  targetDdl: string;
}

export const SCHEMA_DIFF_PRESETS: SchemaDiffPreset[] = [
  {
    id: 'ecommerce-v1-v2',
    name: 'E-Commerce v1 → v2',
    description: 'Adds subscriptions & coupons, removes legacy_discounts, updates customers & orders.',
    baseDdl: `CREATE TABLE customers (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  tier VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE legacy_discounts (
  id UUID PRIMARY KEY,
  code VARCHAR(32) UNIQUE NOT NULL,
  percent_off INT NOT NULL
);

CREATE TABLE orders (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  legacy_discount_id UUID REFERENCES legacy_discounts(id),
  status VARCHAR(32) NOT NULL,
  total_cents BIGINT NOT NULL,
  discount_note TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE products (
  id UUID PRIMARY KEY,
  sku VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  stock_qty INT NOT NULL
);`,
    targetDdl: `CREATE TABLE customers (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  tier VARCHAR(64) NOT NULL,
  stripe_customer_id VARCHAR(128) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE coupons (
  id UUID PRIMARY KEY,
  code VARCHAR(40) UNIQUE NOT NULL,
  discount_cents BIGINT NOT NULL,
  expires_at TIMESTAMPTZ
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  plan_code VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  renews_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE orders (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  coupon_id UUID REFERENCES coupons(id),
  status VARCHAR(32) NOT NULL,
  total_cents BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE products (
  id UUID PRIMARY KEY,
  sku VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  stock_qty INT NOT NULL
);`,
  },
  {
    id: 'saas-v1-v2',
    name: 'SaaS RBAC v1 → v2',
    description: 'Adds api_keys & audit_logs, removes invite_tokens, adds workspace_id FK.',
    baseDdl: `CREATE TABLE workspaces (
  id UUID PRIMARY KEY,
  slug VARCHAR(64) UNIQUE NOT NULL,
  plan VARCHAR(32) NOT NULL
);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(32) NOT NULL
);

CREATE TABLE invite_tokens (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  token VARCHAR(128) UNIQUE NOT NULL
);`,
    targetDdl: `CREATE TABLE workspaces (
  id UUID PRIMARY KEY,
  slug VARCHAR(64) UNIQUE NOT NULL,
  plan VARCHAR(64) NOT NULL,
  sso_enforced BOOLEAN NOT NULL
);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(32) NOT NULL,
  last_login_at TIMESTAMPTZ
);

CREATE TABLE api_keys (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  created_by UUID NOT NULL REFERENCES users(id),
  key_hash VARCHAR(128) UNIQUE NOT NULL
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  actor_id UUID REFERENCES users(id),
  action VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);`,
  },
];

function sanitizeMermaidIdent(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, '_') || 'unnamed';
}

function sanitizeMermaidType(raw: string): string {
  return raw.trim().replace(/\s+/g, '_').replace(/[(),]/g, '_') || 'TEXT';
}

function normalizeColType(type: string): string {
  return type.trim().replace(/\s+/g, ' ').toUpperCase();
}

function compareColumn(before: ERColumn, after: ERColumn): string[] {
  const changes: string[] = [];
  if (normalizeColType(before.type) !== normalizeColType(after.type)) {
    changes.push(`type ${before.type} → ${after.type}`);
  }
  if (Boolean(before.isPrimaryKey) !== Boolean(after.isPrimaryKey)) {
    changes.push(after.isPrimaryKey ? 'added PK' : 'removed PK');
  }
  if (Boolean(before.isForeignKey) !== Boolean(after.isForeignKey)) {
    changes.push(after.isForeignKey ? 'added FK' : 'removed FK');
  }
  if (Boolean(before.isUnique) !== Boolean(after.isUnique)) {
    changes.push(after.isUnique ? 'added UNIQUE' : 'removed UNIQUE');
  }
  if (Boolean(before.isNullable) !== Boolean(after.isNullable)) {
    changes.push(after.isNullable ? 'now NULLABLE' : 'now NOT NULL');
  }
  return changes;
}

function quoteId(id: string, dialect: SqlDialect): string {
  if (dialect === 'mysql') return `\`${id}\``;
  if (dialect === 'sqlserver') return `[${id}]`;
  return `"${id}"`;
}

export interface SchemaDiffOptions {
  onlyChanges?: boolean;
}

/**
 * Compares two SQL DDL schemas (Base v1 vs Target v2) and produces:
 * - Table-level & column-level diffs (added, removed, modified, unchanged)
 * - Foreign key diffs (added, removed, modified, unchanged)
 * - Merged Mermaid erDiagram syntax annotated with diff labels
 * - Executable SQL migration preview
 */
export function diffSqlSchemas(
  baseDdl: string,
  targetDdl: string,
  dialect: SqlDialect = 'postgresql',
  options?: SchemaDiffOptions
): SchemaDiffResult {
  const onlyChanges = Boolean(options?.onlyChanges);
  const baseParsed = parseSqlDdl(baseDdl);
  const targetParsed = parseSqlDdl(targetDdl);

  const baseEntities = new Map(
    baseParsed.diagram.entities.map((e) => [e.name.toLowerCase(), e])
  );
  const targetEntities = new Map(
    targetParsed.diagram.entities.map((e) => [e.name.toLowerCase(), e])
  );

  const allTableKeys: string[] = [];
  for (const key of targetEntities.keys()) allTableKeys.push(key);
  for (const key of baseEntities.keys()) {
    if (!targetEntities.has(key)) allTableKeys.push(key);
  }

  const tables: TableDiff[] = [];
  const tableStatusMap: Record<string, DiffStatus> = {};

  for (const key of allTableKeys) {
    const before = baseEntities.get(key);
    const after = targetEntities.get(key);

    if (!before && after) {
      const cols: ColumnDiff[] = after.columns.map((c) => ({
        name: c.name,
        status: 'added',
        after: c,
        changes: ['added'],
      }));
      tables.push({
        name: after.name,
        status: 'added',
        columns: cols,
        addedColumnCount: cols.length,
        removedColumnCount: 0,
        modifiedColumnCount: 0,
      });
      tableStatusMap[after.name.toLowerCase()] = 'added';
      continue;
    }

    if (before && !after) {
      const cols: ColumnDiff[] = before.columns.map((c) => ({
        name: c.name,
        status: 'removed',
        before: c,
        changes: ['removed'],
      }));
      tables.push({
        name: before.name,
        status: 'removed',
        columns: cols,
        addedColumnCount: 0,
        removedColumnCount: cols.length,
        modifiedColumnCount: 0,
      });
      tableStatusMap[before.name.toLowerCase()] = 'removed';
      continue;
    }

    if (before && after) {
      const beforeCols = new Map(before.columns.map((c) => [c.name.toLowerCase(), c]));
      const afterCols = new Map(after.columns.map((c) => [c.name.toLowerCase(), c]));
      const colKeys: string[] = [];
      for (const ck of afterCols.keys()) colKeys.push(ck);
      for (const ck of beforeCols.keys()) {
        if (!afterCols.has(ck)) colKeys.push(ck);
      }

      const colDiffs: ColumnDiff[] = [];
      let addedCol = 0;
      let removedCol = 0;
      let modifiedCol = 0;

      for (const ck of colKeys) {
        const bc = beforeCols.get(ck);
        const ac = afterCols.get(ck);
        if (!bc && ac) {
          addedCol++;
          colDiffs.push({ name: ac.name, status: 'added', after: ac, changes: ['added'] });
        } else if (bc && !ac) {
          removedCol++;
          colDiffs.push({ name: bc.name, status: 'removed', before: bc, changes: ['removed'] });
        } else if (bc && ac) {
          const changes = compareColumn(bc, ac);
          if (changes.length > 0) {
            modifiedCol++;
            colDiffs.push({ name: ac.name, status: 'modified', before: bc, after: ac, changes });
          } else {
            colDiffs.push({ name: ac.name, status: 'unchanged', before: bc, after: ac, changes: [] });
          }
        }
      }

      const status: DiffStatus =
        addedCol > 0 || removedCol > 0 || modifiedCol > 0 ? 'modified' : 'unchanged';

      tables.push({
        name: after.name,
        status,
        columns: colDiffs,
        addedColumnCount: addedCol,
        removedColumnCount: removedCol,
        modifiedColumnCount: modifiedCol,
      });
      tableStatusMap[after.name.toLowerCase()] = status;
    }
  }

  // Foreign key comparison (keyed by fromEntity.fromColumn)
  const fkSourceKey = (r: ERRelationship) =>
    `${r.fromEntity.toLowerCase()}.${r.fromColumn.toLowerCase()}`;
  const fkTargetSig = (r: ERRelationship) =>
    `${r.toEntity.toLowerCase()}.${r.toColumn.toLowerCase()}|${r.cardinality}`;

  const baseFks = new Map(baseParsed.diagram.relationships.map((r) => [fkSourceKey(r), r]));
  const targetFks = new Map(targetParsed.diagram.relationships.map((r) => [fkSourceKey(r), r]));

  const allFkKeys: string[] = [];
  for (const k of targetFks.keys()) allFkKeys.push(k);
  for (const k of baseFks.keys()) {
    if (!targetFks.has(k)) allFkKeys.push(k);
  }

  const foreignKeys: ForeignKeyDiff[] = [];
  for (const k of allFkKeys) {
    const b = baseFks.get(k);
    const a = targetFks.get(k);
    if (!b && a) {
      foreignKeys.push({
        key: `${a.fromEntity}.${a.fromColumn}->${a.toEntity}.${a.toColumn}`,
        status: 'added',
        fromEntity: a.fromEntity,
        fromColumn: a.fromColumn,
        toEntity: a.toEntity,
        toColumn: a.toColumn,
        cardinality: a.cardinality,
      });
    } else if (b && !a) {
      foreignKeys.push({
        key: `${b.fromEntity}.${b.fromColumn}->${b.toEntity}.${b.toColumn}`,
        status: 'removed',
        fromEntity: b.fromEntity,
        fromColumn: b.fromColumn,
        toEntity: b.toEntity,
        toColumn: b.toColumn,
        cardinality: b.cardinality,
      });
    } else if (b && a) {
      const changed = fkTargetSig(b) !== fkTargetSig(a);
      foreignKeys.push({
        key: `${a.fromEntity}.${a.fromColumn}->${a.toEntity}.${a.toColumn}`,
        status: changed ? 'modified' : 'unchanged',
        fromEntity: a.fromEntity,
        fromColumn: a.fromColumn,
        toEntity: a.toEntity,
        toColumn: a.toColumn,
        cardinality: a.cardinality,
        previousTarget: changed ? `${b.toEntity}.${b.toColumn}` : undefined,
      });
    }
  }

  // Build merged Mermaid erDiagram syntax with explicit diff annotations
  const diagramTables = onlyChanges
    ? tables.filter((t) => t.status !== 'unchanged')
    : tables;
  const diagramTableNames = new Set(diagramTables.map((t) => t.name.toLowerCase()));
  const diagramFks = onlyChanges
    ? foreignKeys.filter(
        (fk) =>
          fk.status !== 'unchanged' &&
          diagramTableNames.has(fk.fromEntity.toLowerCase()) &&
          diagramTableNames.has(fk.toEntity.toLowerCase())
      )
    : foreignKeys;

  const mermaidLines: string[] = ['erDiagram'];
  for (const table of diagramTables) {
    mermaidLines.push(`  ${sanitizeMermaidIdent(table.name)} {`);
    for (const colDiff of table.columns) {
      const col = colDiff.after ?? colDiff.before!;
      const keys: string[] = [];
      if (col.isPrimaryKey) keys.push('PK');
      if (col.isForeignKey) keys.push('FK');
      if (col.isUnique && !col.isPrimaryKey) keys.push('UK');
      const keyPart = keys.length > 0 ? ` ${keys.join(',')}` : '';

      let comment = '';
      if (table.status === 'added') {
        comment = ' "+ NEW TABLE"';
      } else if (table.status === 'removed') {
        comment = ' "- REMOVED"';
      } else if (colDiff.status === 'added') {
        comment = ' "+ ADDED"';
      } else if (colDiff.status === 'removed') {
        comment = ' "- DROPPED"';
      } else if (colDiff.status === 'modified') {
        comment = ` "~ ${colDiff.changes[0]?.replace(/"/g, "'") || 'MODIFIED'}"`;
      } else if (!col.isNullable && !col.isPrimaryKey) {
        comment = ' "NOT NULL"';
      }

      mermaidLines.push(
        `    ${sanitizeMermaidType(col.type)} ${sanitizeMermaidIdent(col.name)}${keyPart}${comment}`
      );
    }
    mermaidLines.push('  }');
  }

  const cardMap: Record<ERRelationship['cardinality'], string> = {
    '1:1': '||--||',
    '1:N': '||--o{',
    'N:1': '}o--||',
    'N:M': '}o--o{',
  };

  for (const fk of diagramFks) {
    const connector = cardMap[fk.cardinality] ?? '}o--||';
    const prefix =
      fk.status === 'added'
        ? '+FK '
        : fk.status === 'removed'
          ? '-FK '
          : fk.status === 'modified'
            ? '~FK '
            : '';
    const label = `${prefix}${fk.fromColumn}`.replace(/"/g, "'");
    mermaidLines.push(
      `  ${sanitizeMermaidIdent(fk.fromEntity)} ${connector} ${sanitizeMermaidIdent(fk.toEntity)} : "${label}"`
    );
  }

  // Generate executable SQL migration preview
  const migrationStatements: string[] = [
    `-- Auto-generated Schema Diff Migration (${dialect.toUpperCase()})`,
  ];
  const q = (id: string) => quoteId(id, dialect);

  for (const t of tables) {
    if (t.status === 'added') {
      const colLines = t.columns.map((c) => {
        const col = c.after!;
        const parts = [`  ${q(col.name)} ${col.type}`];
        if (col.isPrimaryKey) parts.push('PRIMARY KEY');
        if (col.isUnique && !col.isPrimaryKey) parts.push('UNIQUE');
        if (!col.isNullable && !col.isPrimaryKey) parts.push('NOT NULL');
        return parts.join(' ');
      });
      migrationStatements.push(`CREATE TABLE ${q(t.name)} (\n${colLines.join(',\n')}\n);`);
    } else if (t.status === 'modified') {
      for (const c of t.columns) {
        if (c.status === 'added' && c.after) {
          const nullPart = !c.after.isNullable ? ' NOT NULL' : '';
          const uqPart = c.after.isUnique ? ' UNIQUE' : '';
          migrationStatements.push(
            `ALTER TABLE ${q(t.name)} ADD COLUMN ${q(c.after.name)} ${c.after.type}${uqPart}${nullPart};`
          );
        } else if (c.status === 'removed' && c.before) {
          migrationStatements.push(
            `ALTER TABLE ${q(t.name)} DROP COLUMN ${q(c.before.name)};`
          );
        } else if (c.status === 'modified' && c.after && c.before) {
          if (dialect === 'mysql') {
            migrationStatements.push(
              `ALTER TABLE ${q(t.name)} MODIFY COLUMN ${q(c.after.name)} ${c.after.type}${
                !c.after.isNullable ? ' NOT NULL' : ''
              };`
            );
          } else {
            migrationStatements.push(
              `ALTER TABLE ${q(t.name)} ALTER COLUMN ${q(c.after.name)} TYPE ${c.after.type};`
            );
          }
        }
      }
    }
  }

  for (const fk of foreignKeys) {
    if (fk.status === 'added' || fk.status === 'modified') {
      const constraintName = `fk_${fk.fromEntity}_${fk.fromColumn}`;
      migrationStatements.push(
        `ALTER TABLE ${q(fk.fromEntity)} ADD CONSTRAINT ${q(constraintName)} FOREIGN KEY (${q(fk.fromColumn)}) REFERENCES ${q(fk.toEntity)} (${q(fk.toColumn)});`
      );
    } else if (fk.status === 'removed') {
      const tableRemoved = tableStatusMap[fk.fromEntity.toLowerCase()] === 'removed';
      if (!tableRemoved) {
        const constraintName = `fk_${fk.fromEntity}_${fk.fromColumn}`;
        migrationStatements.push(
          `ALTER TABLE ${q(fk.fromEntity)} DROP CONSTRAINT IF EXISTS ${q(constraintName)};`
        );
      }
    }
  }

  for (const t of tables) {
    if (t.status === 'removed') {
      migrationStatements.push(`DROP TABLE IF EXISTS ${q(t.name)};`);
    }
  }

  const tablesAdded = tables.filter((t) => t.status === 'added').length;
  const tablesRemoved = tables.filter((t) => t.status === 'removed').length;
  const tablesModified = tables.filter((t) => t.status === 'modified').length;
  const tablesUnchanged = tables.filter((t) => t.status === 'unchanged').length;
  const fksAdded = foreignKeys.filter((f) => f.status === 'added').length;
  const fksRemoved = foreignKeys.filter((f) => f.status === 'removed').length;
  const fksModified = foreignKeys.filter((f) => f.status === 'modified').length;
  const totalChanges =
    tablesAdded + tablesRemoved + tablesModified + fksAdded + fksRemoved + fksModified;

  return {
    tables,
    foreignKeys,
    tableStatusMap,
    mergedMermaidCode: diagramTables.length > 0 ? mermaidLines.join('\n') : '',
    migrationSql:
      migrationStatements.length > 1
        ? migrationStatements.join('\n\n')
        : '-- Schemas are identical. No migration statements required.',
    summary: {
      tablesAdded,
      tablesRemoved,
      tablesModified,
      tablesUnchanged,
      fksAdded,
      fksRemoved,
      fksModified,
      totalChanges,
    },
  };
}
