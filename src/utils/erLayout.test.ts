import test from 'node:test';
import assert from 'node:assert/strict';
import { computeERLayout, erDiagramToMermaid, erDiagramToSQL } from './erLayout';
import type { ERDiagramData } from '../types/nova';

const SAMPLE_DIAGRAM: ERDiagramData = {
  title: 'Billing Schema',
  entities: [
    {
      id: 'users',
      name: 'users',
      columns: [
        { name: 'id', type: 'UUID', isPrimaryKey: true },
        { name: 'email', type: 'VARCHAR(255)', isUnique: true },
      ],
    },
    {
      id: 'invoices',
      name: 'invoices',
      columns: [
        { name: 'id', type: 'UUID', isPrimaryKey: true },
        { name: 'user_id', type: 'UUID', isForeignKey: true, references: 'users.id' },
        { name: 'amount_cents', type: 'BIGINT' },
      ],
    },
  ],
  relationships: [
    {
      id: 'r1',
      fromEntity: 'invoices',
      fromColumn: 'user_id',
      toEntity: 'users',
      toColumn: 'id',
      cardinality: 'N:1',
      label: 'billed_to',
    },
  ],
};

test('computeERLayout positions entities without overlap and routes edges', () => {
  const layout = computeERLayout(SAMPLE_DIAGRAM);
  assert.equal(layout.nodes.length, 2);
  assert.equal(layout.edges.length, 1);
  const [n1, n2] = layout.nodes;
  assert.ok(n1.x + n1.width < n2.x, 'Entities in adjacent columns must not overlap');
  assert.ok(layout.edges[0].path.startsWith('M '), 'Edge path should be a valid SVG path');
  assert.equal(layout.edges[0].fromCardinality, 'N');
  assert.equal(layout.edges[0].toCardinality, '1');
});

test('erDiagramToMermaid generates valid Mermaid erDiagram output', () => {
  const mermaid = erDiagramToMermaid(SAMPLE_DIAGRAM);
  assert.ok(mermaid.startsWith('erDiagram'));
  assert.ok(mermaid.includes('UUID id PK'));
  assert.ok(mermaid.includes('invoices }o--|| users : "billed_to"'));
});

test('erDiagramToSQL generates dialect-specific CREATE TABLE DDL with keys', () => {
  const pgSql = erDiagramToSQL(SAMPLE_DIAGRAM, 'postgresql');
  assert.ok(pgSql.includes('CREATE TABLE "users"'));
  assert.ok(pgSql.includes('PRIMARY KEY ("id")'));
  assert.ok(pgSql.includes('FOREIGN KEY ("user_id") REFERENCES "users" ("id")'));

  const mysqlSql = erDiagramToSQL(SAMPLE_DIAGRAM, 'mysql');
  assert.ok(mysqlSql.includes('CREATE TABLE `invoices`'));
});
