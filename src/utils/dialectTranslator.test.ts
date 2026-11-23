import test from 'node:test';
import assert from 'node:assert/strict';
import { translateSqlDialect } from './dialectTranslator';

test('translateSqlDialect converts PostgreSQL ILIKE and DATE_TRUNC to MySQL', () => {
  const sql = `SELECT * FROM orders WHERE status ILIKE 'pending' AND DATE_TRUNC('month', created_at) = '2026-05-01';`;
  const result = translateSqlDialect(sql, 'postgresql', 'mysql');

  assert.ok(result.translatedCode.includes('LOWER(status) LIKE LOWER(\'pending\')'));
  assert.ok(result.translatedCode.includes('DATE_FORMAT(created_at, \'%Y-%m-01\')'));
  assert.equal(result.transformations.length, 2);
});

test('translateSqlDialect converts LIMIT to SQL Server TOP', () => {
  const sql = `SELECT id, name FROM users LIMIT 25;`;
  const result = translateSqlDialect(sql, 'postgresql', 'sqlserver');

  assert.ok(result.translatedCode.includes('SELECT TOP 25 id, name FROM users'));
  assert.ok(!result.translatedCode.includes('LIMIT 25'));
});

test('translateSqlDialect translates SQL to MongoDB aggregation pipeline', () => {
  const sql = `SELECT id, name FROM users WHERE status = 'active' LIMIT 10;`;
  const result = translateSqlDialect(sql, 'postgresql', 'mongodb');

  assert.ok(result.translatedCode.includes('db.users.aggregate'));
  assert.ok(result.translatedCode.includes('$match'));
  assert.ok(result.translatedCode.includes('$limit'));
});
