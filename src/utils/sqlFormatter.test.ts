import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSqlMetrics, tokenizeSql } from './sqlFormatter';

test('tokenizeSql classifies keywords, strings, numbers, and comments', () => {
  const tokens = tokenizeSql("SELECT id, 'nova' FROM orders WHERE total > 42 -- comment");
  assert.ok(tokens.some((t) => t.type === 'keyword' && t.value === 'SELECT'));
  assert.ok(tokens.some((t) => t.type === 'string' && t.value === "'nova'"));
  assert.ok(tokens.some((t) => t.type === 'number' && t.value === '42'));
  assert.ok(tokens.some((t) => t.type === 'comment' && t.value === '-- comment'));
});

test('analyzeSqlMetrics detects joins, CTEs, line counts, and SELECT *', () => {
  const query = `WITH recent AS (
  SELECT * FROM orders
  INNER JOIN customers ON customers.id = orders.customer_id
  LEFT JOIN shipments ON shipments.order_id = orders.id
)
SELECT * FROM recent;`;
  const metrics = analyzeSqlMetrics(query);
  assert.equal(metrics.lineCount, 6);
  assert.equal(metrics.joinCount, 2);
  assert.equal(metrics.cteCount, 1);
  assert.equal(metrics.hasSelectStar, true);
});
