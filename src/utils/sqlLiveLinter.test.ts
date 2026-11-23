import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAllLintQuickFixes,
  applyLintQuickFix,
  lintSqlLive,
  looksLikeSqlOrNoSql,
} from './sqlLiveLinter';

test('looksLikeSqlOrNoSql distinguishes natural-language prompts from SQL queries', () => {
  assert.equal(looksLikeSqlOrNoSql('Find top 10 customers by net revenue in Q4'), false);
  assert.equal(looksLikeSqlOrNoSql('SELECT id, email FROM customers WHERE tier = \'pro\''), true);
  assert.equal(looksLikeSqlOrNoSql('SELCT * FORM orders'), true);
  assert.equal(looksLikeSqlOrNoSql('DELETE FROM sessions'), true);
});

test('lintSqlLive catches syntax errors, typos, = NULL, trailing commas, and applies Quick Fixes', () => {
  const broken = "SELCT *, FROM orders WHERE deleted_at = NULL AND status = 'open";
  const res = lintSqlLive(broken, 'postgresql');

  assert.equal(res.isSql, true);
  const codes = new Set(res.diagnostics.map((d) => d.code));
  assert.ok(codes.has('SQL001'), 'detects unclosed single quote');
  assert.ok(codes.has('SQL003'), 'detects SELCT typo');
  assert.ok(codes.has('SQL004'), 'detects trailing comma before FROM');
  assert.ok(codes.has('SQL005'), 'detects = NULL comparison');
  assert.ok(codes.has('SQL101'), 'detects SELECT * anti-pattern');

  const nullDiag = res.diagnostics.find((d) => d.code === 'SQL005')!;
  assert.equal(nullDiag.quickFix?.replacement, 'IS NULL');
  const fixedNull = applyLintQuickFix(broken, nullDiag);
  assert.ok(fixedNull.includes('deleted_at IS NULL'));
});

test('lintSqlLive catches DELETE without WHERE, non-SARGable YEAR(), leading wildcard LIKE, and dialect mismatch', () => {
  const deleteRes = lintSqlLive('DELETE FROM audit_logs;', 'postgresql');
  assert.ok(deleteRes.diagnostics.some((d) => d.code === 'SQL007' && d.severity === 'error'));

  const perfQuery =
    "SELECT id FROM orders WHERE YEAR(created_at) = 2026 AND email ILIKE '%@gmail.com' ORDER BY id";
  const mysqlRes = lintSqlLive(perfQuery, 'mysql');
  const codes = new Set(mysqlRes.diagnostics.map((d) => d.code));
  assert.ok(codes.has('SQL103'), 'detects non-SARGable YEAR()');
  assert.ok(codes.has('SQL104'), 'detects leading wildcard LIKE');
  assert.ok(codes.has('SQL201'), 'detects ORDER BY without LIMIT');
  assert.ok(codes.has('SQL203'), 'detects PostgreSQL ILIKE in MySQL');

  const yearDiag = mysqlRes.diagnostics.find((d) => d.code === 'SQL103')!;
  const fixedYear = applyLintQuickFix(perfQuery, yearDiag);
  assert.ok(fixedYear.includes("created_at >= '2026-01-01' AND created_at < '2027-01-01'"));
});

test('lintSqlLive ignores strings and comments so clean parameterized SQL passes with 0 errors', () => {
  const cleanSql = `-- Comment mentioning = NULL and SELECT *
SELECT c.id, c.email
FROM customers c
WHERE c.note = 'SELECT * FROM fake = NULL'
ORDER BY c.id DESC
LIMIT 25;`;

  const res = lintSqlLive(cleanSql, 'postgresql');
  assert.equal(res.isSql, true);
  assert.equal(res.errorCount, 0);
  assert.equal(res.warningCount, 0);
  assert.equal(res.infoCount, 0);
});

test('lintSqlLive catches JOIN without ON/USING (SQL008), duplicate keywords (SQL009), and applyAllLintQuickFixes fixes multiple issues cleanly', () => {
  const joinBroken = 'SELECT o.id FROM orders o JOIN customers c WHERE o.status = \'paid\'';
  const joinRes = lintSqlLive(joinBroken, 'postgresql');
  assert.ok(joinRes.diagnostics.some((d) => d.code === 'SQL008'));

  const multiBroken =
    'SELECT id, FROM orders\nWHERE deleted_at = NULL\n  AND AND YEAR(created_at) = 2026\nLIMIT 10';
  const multiRes = lintSqlLive(multiBroken, 'postgresql');
  const codes = new Set(multiRes.diagnostics.map((d) => d.code));
  assert.ok(codes.has('SQL004'));
  assert.ok(codes.has('SQL005'));
  assert.ok(codes.has('SQL009'));
  assert.ok(codes.has('SQL103'));

  const { text: fixed, appliedCount } = applyAllLintQuickFixes(multiBroken, multiRes.diagnostics);
  assert.equal(appliedCount, 4);
  assert.ok(fixed.includes('SELECT id FROM orders'));
  assert.ok(fixed.includes('deleted_at IS NULL'));
  assert.ok(!fixed.includes('AND AND'));
  assert.ok(fixed.includes("created_at >= '2026-01-01' AND created_at < '2027-01-01'"));

  const afterLint = lintSqlLive(fixed, 'postgresql');
  assert.equal(afterLint.errorCount, 0);
  assert.equal(afterLint.warningCount, 0);
});
