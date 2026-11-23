import assert from 'node:assert/strict';
import test from 'node:test';
import type { ERDiagramData } from '../types/nova';
import {
  buildDbmlExport,
  buildJsonSchemaExport,
  buildMarkdownSpecExport,
  buildSqlScriptExport,
  prepareStandaloneSvg,
  sanitizeFilename,
} from './exportStudio';

const SAMPLE_DIAGRAM: ERDiagramData = {
  title: 'Billing Core Schema',
  entities: [
    {
      id: 'users',
      name: 'users',
      columns: [
        { name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false },
        { name: 'email', type: 'VARCHAR(255)', isUnique: true, isNullable: false },
      ],
    },
    {
      id: 'invoices',
      name: 'invoices',
      columns: [
        { name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false },
        { name: 'user_id', type: 'UUID', isForeignKey: true, isNullable: false },
        { name: 'amount_cents', type: 'INT', isNullable: false },
      ],
    },
  ],
  relationships: [
    {
      id: 'rel-1',
      fromEntity: 'users',
      toEntity: 'invoices',
      fromColumn: 'id',
      toColumn: 'user_id',
      cardinality: '1:N',
      label: 'billed_to',
    },
  ],
};

test('sanitizeFilename produces clean slugified filenames with extension', () => {
  assert.equal(sanitizeFilename('E-Commerce Core!!', 'sql'), 'e-commerce-core.sql');
  assert.equal(sanitizeFilename('   ', '.PNG'), 'nova-export.png');
  assert.equal(sanitizeFilename('Billing / Invoices 2026', 'dbml'), 'billing-invoices-2026.dbml');
});

test('buildSqlScriptExport prepends dialect metadata header and trailing newline', () => {
  const output = buildSqlScriptExport('CREATE TABLE users (id INT PRIMARY KEY);', {
    title: 'Billing Core',
    dialect: 'postgresql',
    generatedAt: '2026-11-22T00:00:00.000Z',
  });
  assert.match(output, /^-- Schema: Billing Core\n-- Dialect: POSTGRESQL\n/);
  assert.match(output, /CREATE TABLE users \(id INT PRIMARY KEY\);\n$/);
});

test('buildDbmlExport outputs valid Table blocks and Ref relationships', () => {
  const dbml = buildDbmlExport(SAMPLE_DIAGRAM);
  assert.match(dbml, /Table users \{/);
  assert.match(dbml, /id UUID \[pk\]/);
  assert.match(dbml, /email VARCHAR\(255\) \[unique, not null\]/);
  assert.match(dbml, /Ref: users\.id < invoices\.user_id/);
});

test('buildJsonSchemaExport and buildMarkdownSpecExport include entities, Mermaid, and SQL DDL', () => {
  const json = JSON.parse(buildJsonSchemaExport(SAMPLE_DIAGRAM, 'mysql'));
  assert.equal(json.dialect, 'mysql');
  assert.equal(json.entities.length, 2);
  assert.equal(json.relationships.length, 1);

  const md = buildMarkdownSpecExport(
    SAMPLE_DIAGRAM,
    'postgresql',
    'CREATE TABLE users (id UUID PRIMARY KEY);',
    'erDiagram\n  users ||--o{ invoices : billed_to'
  );
  assert.match(md, /^# Billing Core Schema/);
  assert.match(md, /```mermaid/);
  assert.match(md, /```sql/);
  assert.match(md, /\| `email` \| `VARCHAR\(255\)` \| UQ \| NO \|/);
});

test('prepareStandaloneSvg adds xmlns, explicit numeric dimensions from viewBox, and paper background', () => {
  const raw = '<svg viewBox="-10 -20 640 420" width="100%"><g><rect width="100" height="50"/></g></svg>';
  const result = prepareStandaloneSvg(raw);
  assert.equal(result.width, 640);
  assert.equal(result.height, 420);
  assert.match(result.markup, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(result.markup, /width="640" height="420"/);
  assert.match(result.markup, /data-nova-export-bg="1" x="-10" y="-20" width="640" height="420" fill="#f6f4ef"/);
});
