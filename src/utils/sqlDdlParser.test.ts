import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BROKEN_DEBUG_SCHEMA_DDL,
  parseSqlDdl,
  splitTopLevelCommas,
  stripSqlComments,
} from './sqlDdlParser';
import { PRESET_SCHEMAS } from './sqlFormatter';

test('stripSqlComments removes line and block comments while keeping string literals', () => {
  const input = `
    -- table comment
    CREATE TABLE notes (
      id INT PRIMARY KEY, /* inline comment */
      body VARCHAR(100) DEFAULT '-- keep me'
    );
  `;
  const cleaned = stripSqlComments(input);
  assert.ok(!cleaned.includes('table comment'));
  assert.ok(!cleaned.includes('inline comment'));
  assert.ok(cleaned.includes("'-- keep me'"));
});

test('splitTopLevelCommas respects nested parens like DECIMAL(10, 2) and CHECK IN', () => {
  const parts = splitTopLevelCommas(
    "id UUID PRIMARY KEY, price DECIMAL(10, 2) NOT NULL, status VARCHAR(16) CHECK (status IN ('open', 'closed'))"
  );
  assert.equal(parts.length, 3);
  assert.ok(parts[1].includes('DECIMAL(10, 2)'));
  assert.ok(parts[2].includes("'open', 'closed'"));
});

test('parseSqlDdl parses E-Commerce Core preset cleanly into entities, relationships, and Mermaid syntax', () => {
  const result = parseSqlDdl(PRESET_SCHEMAS[0].ddl);
  assert.equal(result.parseErrors.length, 0);
  assert.equal(result.stats.tableCount, 4);
  assert.equal(result.stats.relationshipCount, 3);
  assert.equal(result.stats.criticalCount, 0);

  const orders = result.diagram.entities.find((e) => e.name === 'orders');
  assert.ok(orders);
  const custFk = orders.columns.find((c) => c.name === 'customer_id');
  assert.equal(custFk?.isForeignKey, true);
  assert.equal(custFk?.references, 'customers.id');

  assert.ok(result.mermaidCode.startsWith('erDiagram'));
  assert.ok(result.mermaidCode.includes('orders }o--|| customers'));
  assert.ok(result.mermaidCode.includes('order_items }o--|| products'));
});

test('parseSqlDdl handles ALTER TABLE foreign keys, composite primary keys, and CREATE INDEX', () => {
  const ddl = `
    CREATE TABLE orgs (
      id BIGINT,
      slug VARCHAR(64) UNIQUE NOT NULL,
      PRIMARY KEY (id)
    );

    CREATE TABLE memberships (
      org_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      PRIMARY KEY (org_id, user_id)
    );

    ALTER TABLE memberships
      ADD CONSTRAINT fk_memberships_org
      FOREIGN KEY (org_id) REFERENCES orgs(id);

    CREATE INDEX idx_memberships_org ON memberships (org_id);
  `;
  const result = parseSqlDdl(ddl);
  assert.equal(result.stats.tableCount, 2);
  assert.equal(result.stats.relationshipCount, 1);
  assert.equal(result.stats.indexCount, 1);
  assert.equal(result.stats.criticalCount, 0);
  assert.equal(result.stats.warningCount, 0);
  // FK is covered by both composite PK leading column and explicit index, so no unindexed-FK warning
  assert.ok(!result.issues.some((i) => i.id.startsWith('unindexed-fk')));
});

test('parseSqlDdl detects broken FK table, FK type mismatch, missing PK, and orphan table', () => {
  const result = parseSqlDdl(BROKEN_DEBUG_SCHEMA_DDL);
  assert.equal(result.stats.tableCount, 3);
  assert.equal(result.stats.relationshipCount, 1); // customers <- orders; warehouses is missing

  assert.ok(
    result.issues.some((i) => i.severity === 'Critical' && i.title.includes('warehouses')),
    'should flag missing referenced table warehouses'
  );
  assert.ok(
    result.issues.some((i) => i.severity === 'Warning' && i.title.includes('type mismatch')),
    'should flag INT -> UUID foreign key type mismatch'
  );
  assert.ok(
    result.issues.some((i) => i.severity === 'Warning' && i.table === 'audit_logs' && i.title.includes('PRIMARY KEY')),
    'should flag missing primary key on audit_logs'
  );
  assert.ok(
    result.issues.some((i) => i.severity === 'Suggestion' && i.table === 'audit_logs' && i.title.includes('Disconnected')),
    'should flag orphan table audit_logs'
  );
  assert.ok(
    result.issues.some((i) => i.severity === 'Suggestion' && i.column === 'customer_id' && i.title.includes('Unindexed')),
    'should flag unindexed foreign key orders.customer_id'
  );
});

test('parseSqlDdl reports unclosed CREATE TABLE syntax gracefully without throwing', () => {
  const result = parseSqlDdl('CREATE TABLE broken_table (id INT PRIMARY KEY, name VARCHAR(50)');
  assert.equal(result.parseErrors.length, 1);
  assert.equal(result.stats.criticalCount, 1);
});
