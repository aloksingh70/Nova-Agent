import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSqlQuery, computeLineDiff } from './sqlAnalyzer';

test('analyzeSqlQuery catches = NULL and LEFT JOIN filtered in WHERE result-mismatch traps', () => {
  const query = `SELECT u.name, SUM(o.amount)
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE o.status != 'cancelled' AND u.deleted_at = NULL
GROUP BY u.name;`;

  const result = analyzeSqlQuery(query, {
    expectedBehavior: 'Include users with zero orders',
    actualIssue: 'Returned 0 rows',
  });

  const ids = result.findings.map((f) => f.id);
  assert.ok(ids.includes('mismatch-eq-null'), 'Should detect = NULL trap');
  assert.ok(ids.includes('mismatch-left-join-where'), 'Should detect LEFT JOIN WHERE trap');
  assert.ok(result.suggestedSql.includes('IS NULL'), 'Suggested SQL should rewrite = NULL to IS NULL');
  assert.ok(result.mismatchHints.length >= 1, 'Should provide symptom-based mismatch hints');
});

test('analyzeSqlQuery catches non-SARGable YEAR(), SELECT *, and missing LIMIT', () => {
  const query = `SELECT * FROM orders o WHERE YEAR(o.created_at) = 2026 ORDER BY o.total DESC;`;
  const result = analyzeSqlQuery(query);
  const ids = result.findings.map((f) => f.id);

  assert.ok(ids.includes('efficiency-select-star'));
  assert.ok(ids.includes('efficiency-non-sargable'));
  assert.ok(ids.includes('efficiency-unbounded-sort'));
  assert.ok(result.suggestedSql.includes("o.created_at >= '2026-01-01'"));
  assert.ok(result.suggestedSql.includes('LIMIT 100;'));
});

test('analyzeSqlQuery detects aggregate in WHERE and NOT IN NULL trap', () => {
  const query = `SELECT dept, AVG(salary) FROM employees WHERE AVG(salary) > 90000 AND dept_id NOT IN (SELECT id FROM archived_depts) GROUP BY dept;`;
  const result = analyzeSqlQuery(query);
  const ids = result.findings.map((f) => f.id);

  assert.ok(ids.includes('syntax-agg-in-where'));
  assert.ok(ids.includes('mismatch-not-in-subquery'));
});

test('computeLineDiff distinguishes unchanged, removed, and added lines', () => {
  const diff = computeLineDiff('SELECT *\nWHERE a = NULL;', 'SELECT *\nWHERE a IS NULL;');
  assert.deepEqual(
    diff.map((d) => d.kind),
    ['same', 'removed', 'added']
  );
});
