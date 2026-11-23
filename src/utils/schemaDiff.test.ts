import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_DIFF_PRESETS, diffSqlSchemas } from './schemaDiff';

test('diffSqlSchemas identifies added, removed, modified, and unchanged tables and FKs in E-Commerce v1→v2 preset', () => {
  const preset = SCHEMA_DIFF_PRESETS[0];
  const diff = diffSqlSchemas(preset.baseDdl, preset.targetDdl, 'postgresql');

  assert.equal(diff.tableStatusMap.coupons, 'added');
  assert.equal(diff.tableStatusMap.subscriptions, 'added');
  assert.equal(diff.tableStatusMap.legacy_discounts, 'removed');
  assert.equal(diff.tableStatusMap.customers, 'modified');
  assert.equal(diff.tableStatusMap.orders, 'modified');
  assert.equal(diff.tableStatusMap.products, 'unchanged');

  assert.equal(diff.summary.tablesAdded, 2);
  assert.equal(diff.summary.tablesRemoved, 1);
  assert.equal(diff.summary.tablesModified, 2);
  assert.equal(diff.summary.tablesUnchanged, 1);

  const fkStatuses = Object.fromEntries(
    diff.foreignKeys.map((fk) => [`${fk.fromEntity}.${fk.fromColumn}`, fk.status])
  );
  assert.equal(fkStatuses['subscriptions.customer_id'], 'added');
  assert.equal(fkStatuses['orders.coupon_id'], 'added');
  assert.equal(fkStatuses['orders.legacy_discount_id'], 'removed');
  assert.equal(fkStatuses['orders.customer_id'], 'unchanged');

  // Merged Mermaid diagram includes diff annotations
  assert.match(diff.mergedMermaidCode, /^erDiagram/);
  assert.match(diff.mergedMermaidCode, /\+FK coupon_id/);
  assert.match(diff.mergedMermaidCode, /-FK legacy_discount_id/);
  assert.match(diff.mergedMermaidCode, /stripe_customer_id/);

  // Migration SQL includes CREATE, ALTER, and DROP statements
  assert.match(diff.migrationSql, /CREATE TABLE "coupons"/);
  assert.match(diff.migrationSql, /ALTER TABLE "customers" ADD COLUMN "stripe_customer_id"/);
  assert.match(diff.migrationSql, /ALTER TABLE "orders" DROP COLUMN "discount_note"/);
  assert.match(diff.migrationSql, /DROP TABLE IF EXISTS "legacy_discounts"/);
});

test('diffSqlSchemas detects modified FK targets and identical schemas cleanly', () => {
  const v1 = `CREATE TABLE a (id INT PRIMARY KEY);
CREATE TABLE b (id INT PRIMARY KEY);
CREATE TABLE c (id INT PRIMARY KEY, ref_id INT REFERENCES a(id));`;

  const v2 = `CREATE TABLE a (id INT PRIMARY KEY);
CREATE TABLE b (id INT PRIMARY KEY);
CREATE TABLE c (id INT PRIMARY KEY, ref_id INT REFERENCES b(id));`;

  const changed = diffSqlSchemas(v1, v2, 'mysql');
  const fk = changed.foreignKeys.find((f) => f.fromEntity === 'c' && f.fromColumn === 'ref_id');
  assert.equal(fk?.status, 'modified');
  assert.equal(fk?.previousTarget, 'a.id');
  assert.match(changed.mergedMermaidCode, /~FK ref_id/);
  assert.match(changed.migrationSql, /ALTER TABLE `c` ADD CONSTRAINT/);

  const identical = diffSqlSchemas(v1, v1, 'postgresql');
  assert.equal(identical.summary.totalChanges, 0);
  assert.match(identical.migrationSql, /Schemas are identical/);
});

test('diffSqlSchemas with onlyChanges omits unchanged tables and unchanged FKs from Mermaid output', () => {
  const preset = SCHEMA_DIFF_PRESETS[0];
  const filtered = diffSqlSchemas(preset.baseDdl, preset.targetDdl, 'postgresql', {
    onlyChanges: true,
  });

  // Unchanged products table and unchanged orders->customers FK are excluded from the Mermaid diagram
  assert.doesNotMatch(filtered.mergedMermaidCode, /\bproducts\s*\{/);
  assert.doesNotMatch(filtered.mergedMermaidCode, /orders\s+\}o--\|\|\s+customers\s*:\s*"customer_id"/);
  // Added, modified, and removed tables and FKs remain present
  assert.match(filtered.mergedMermaidCode, /\bcoupons\s*\{/);
  assert.match(filtered.mergedMermaidCode, /\bsubscriptions\s*\{/);
  assert.match(filtered.mergedMermaidCode, /\blegacy_discounts\s*\{/);
  assert.match(filtered.mergedMermaidCode, /\+FK coupon_id/);
  assert.match(filtered.mergedMermaidCode, /-FK legacy_discount_id/);
});
