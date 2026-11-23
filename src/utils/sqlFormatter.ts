import type { ModeMeta, SqlDialect } from '../types/nova';

export interface SqlToken {
  type: 'keyword' | 'string' | 'number' | 'comment' | 'operator' | 'identifier' | 'plain';
  value: string;
}

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS',
  'ON', 'AS', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'TRUE', 'FALSE', 'ORDER', 'BY',
  'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
  'DELETE', 'CREATE', 'TABLE', 'INDEX', 'UNIQUE', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES',
  'ALTER', 'DROP', 'WITH', 'RECURSIVE', 'UNION', 'ALL', 'DISTINCT', 'CASE', 'WHEN', 'THEN',
  'ELSE', 'END', 'OVER', 'PARTITION', 'ROWS', 'BETWEEN', 'DESC', 'ASC', 'DEFAULT', 'CHECK',
  'CONSTRAINT', 'CASCADE', 'RETURNING', 'EXPLAIN', 'ANALYZE', 'COALESCE', 'COUNT', 'SUM',
  'AVG', 'MIN', 'MAX', 'RANK', 'DENSE_RANK', 'ROW_NUMBER', 'LAG', 'LEAD', 'DATE_TRUNC',
  'INTERVAL', 'CAST', 'EXISTS', 'ILIKE', 'LIKE', 'USING', 'CONCURRENTLY', 'MATERIALIZED',
  'VIEW', 'TRIGGER', 'FUNCTION', 'BEGIN', 'COMMIT', 'ROLLBACK', 'JSONB', 'UUID', 'VARCHAR',
  'INTEGER', 'INT', 'BIGINT', 'NUMERIC', 'DECIMAL', 'BOOLEAN', 'TIMESTAMP', 'TIMESTAMPTZ',
  'TEXT', 'SERIAL', 'BIGSERIAL',
]);

/**
 * Lightweight, deterministic SQL tokenizer for syntax highlighting without runtime dependencies.
 */
export function tokenizeSql(code: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  const regex =
    /(--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b|[(),;=<>!+\-*/.%]+|\s+|.)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(code)) !== null) {
    const val = match[0];
    if (val.startsWith('--') || val.startsWith('/*')) {
      tokens.push({ type: 'comment', value: val });
    } else if (val.startsWith("'") || val.startsWith('"')) {
      tokens.push({ type: 'string', value: val });
    } else if (/^\d/.test(val)) {
      tokens.push({ type: 'number', value: val });
    } else if (/^[A-Za-z_]/.test(val)) {
      if (SQL_KEYWORDS.has(val.toUpperCase())) {
        tokens.push({ type: 'keyword', value: val });
      } else {
        tokens.push({ type: 'identifier', value: val });
      }
    } else if (/^[(),;=<>!+\-*/.%]+$/.test(val)) {
      tokens.push({ type: 'operator', value: val });
    } else {
      tokens.push({ type: 'plain', value: val });
    }
  }
  return tokens;
}

export interface QueryMetrics {
  lineCount: number;
  joinCount: number;
  cteCount: number;
  hasSelectStar: boolean;
}

export function analyzeSqlMetrics(code: string): QueryMetrics {
  const trimmed = code.trim();
  if (!trimmed) {
    return { lineCount: 0, joinCount: 0, cteCount: 0, hasSelectStar: false };
  }
  const lineCount = trimmed.split('\n').length;
  const joinCount = (trimmed.match(/\bJOIN\b/gi) ?? []).length;
  const cteCount = (trimmed.match(/\bWITH\b/gi) ?? []).length;
  const hasSelectStar = /\bSELECT\s+\*/i.test(trimmed);
  return { lineCount, joinCount, cteCount, hasSelectStar };
}

export const DIALECT_OPTIONS: { id: SqlDialect; label: string }[] = [
  { id: 'postgresql', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL 8' },
  { id: 'sqlite', label: 'SQLite' },
  { id: 'sqlserver', label: 'SQL Server' },
  { id: 'bigquery', label: 'BigQuery' },
  { id: 'mongodb', label: 'MongoDB' },
];

export const NOVA_MODES: ModeMeta[] = [
  {
    id: 'text-to-query',
    shortLabel: 'Text → Query',
    label: 'Text to Query',
    description: 'Translate plain English requirements into clean, parameterized SQL or NoSQL.',
    placeholder: 'Describe the query you need (e.g. Monthly MRR cohort retention for active SaaS workspaces)...',
    samplePrompts: [
      'Find top 10 customers by net revenue in Q4 excluding refunded orders with running total',
      'Calculate 30-day rolling user retention cohorts grouped by signup week',
      'List products whose inventory dropped below reorder threshold with vendor contact',
    ],
  },
  {
    id: 'er-diagram',
    shortLabel: 'Text → ER',
    label: 'Text to ER Diagram',
    description: 'Generate an interactive visual Entity-Relationship diagram with PK/FK keys, cardinality, and DDL.',
    placeholder: 'Describe your domain entities (e.g. Multi-tenant hospital booking system with doctors, patients, billing)...',
    samplePrompts: [
      'Design an ER diagram for a multi-vendor marketplace with orders, line items, shipments, and reviews',
      'Create an ER diagram for a fintech double-entry ledger with accounts, journals, postings, and currencies',
      'Model a SaaS subscription platform with organizations, seats, plans, invoices, and webhook events',
    ],
  },
  {
    id: 'optimize',
    shortLabel: 'Optimize',
    label: 'Optimize Query',
    description: 'Rewrite slow queries, eliminate full-table scans, and get targeted composite index recommendations.',
    placeholder: 'Paste your slow SQL query here to rewrite and tune indexes...',
    samplePrompts: [
      'SELECT * FROM orders o WHERE LOWER(o.customer_email) = \'a@b.com\' AND YEAR(o.created_at) = 2026 ORDER BY o.total DESC;',
      'SELECT u.id, (SELECT COUNT(*) FROM events e WHERE e.user_id = u.id AND e.kind = \'click\') FROM users u WHERE u.status = \'active\';',
    ],
  },
  {
    id: 'debug',
    shortLabel: 'Debug',
    label: 'Debug Query',
    description: 'Pinpoint syntax errors, GROUP BY traps, NULL comparison bugs, and join fan-outs.',
    placeholder: 'Paste your broken query and optional error message...',
    samplePrompts: [
      'SELECT department_id, employee_name, AVG(salary) FROM employees WHERE AVG(salary) > 90000 GROUP BY department_id;',
      'SELECT u.name, SUM(o.amount) FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE o.status != \'cancelled\' GROUP BY u.name;',
    ],
  },
  {
    id: 'schema-builder',
    shortLabel: 'Schema DDL',
    label: 'Schema Builder',
    description: 'Draft normalized 3NF DDL tables, constraints, indexes, and sample seed inserts.',
    placeholder: 'Describe the application data model you want to scaffold in SQL DDL...',
    samplePrompts: [
      'Build a normalized PostgreSQL schema for an event ticketing platform with seat holds and idempotent payments',
      'Create a schema for an audit-logged RBAC permissions system with roles, policies, and API tokens',
    ],
  },
  {
    id: 'explain',
    shortLabel: 'Explain',
    label: 'Explain Query',
    description: 'Break down dense CTEs, window functions, and multi-joins into plain execution steps.',
    placeholder: 'Paste a complex query you want explained step by step...',
    samplePrompts: [
      'WITH ranked AS (SELECT user_id, amount, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) rn FROM payments) SELECT * FROM ranked WHERE rn = 1;',
    ],
  },
  {
    id: 'convert',
    shortLabel: 'Dialect',
    label: 'Convert Dialect',
    description: 'Translate queries seamlessly across PostgreSQL, MySQL, BigQuery, SQL Server, and MongoDB.',
    placeholder: 'Paste a query and specify the target dialect (or select dialect above)...',
    samplePrompts: [
      'Convert this MySQL query using GROUP_CONCAT and IFNULL into idiomatic PostgreSQL',
      'Translate a PostgreSQL grouped revenue query into a MongoDB aggregation pipeline',
    ],
  },
];

export const PRESET_SCHEMAS: { id: string; name: string; ddl: string }[] = [
  {
    id: 'ecommerce',
    name: 'E-Commerce Core',
    ddl: `CREATE TABLE customers (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  tier VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE orders (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  status VARCHAR(32) NOT NULL,
  total_cents BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INT NOT NULL,
  unit_price_cents BIGINT NOT NULL
);

CREATE TABLE products (
  id UUID PRIMARY KEY,
  sku VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  stock_qty INT NOT NULL,
  reorder_level INT NOT NULL
);`,
  },
  {
    id: 'saas',
    name: 'SaaS Multi-Tenant',
    ddl: `CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  slug VARCHAR(120) UNIQUE NOT NULL,
  plan VARCHAR(40) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(32) NOT NULL,
  last_active_at TIMESTAMPTZ
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  amount_cents BIGINT NOT NULL,
  status VARCHAR(24) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL
);`,
  },
  {
    id: 'fintech',
    name: 'Double-Entry Ledger',
    ddl: `CREATE TABLE accounts (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL,
  currency CHAR(3) NOT NULL,
  account_type VARCHAR(24) NOT NULL
);

CREATE TABLE journal_entries (
  id UUID PRIMARY KEY,
  reference_code VARCHAR(80) UNIQUE NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE postings (
  id UUID PRIMARY KEY,
  journal_id UUID NOT NULL REFERENCES journal_entries(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  amount_minor BIGINT NOT NULL,
  direction VARCHAR(6) CHECK (direction IN ('DEBIT', 'CREDIT'))
);`,
  },
];
