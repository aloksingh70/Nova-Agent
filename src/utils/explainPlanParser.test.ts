import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExplainAnalyze, SAMPLE_EXPLAIN_PLANS } from './explainPlanParser';

test('parseExplainAnalyze detects Sequential Scan bottleneck on orders table', () => {
  const result = parseExplainAnalyze(SAMPLE_EXPLAIN_PLANS[0].json);
  assert.equal(result.root.nodeType, 'Seq Scan');
  assert.equal(result.root.relationName, 'orders');
  assert.equal(result.root.severity, 'critical');
  assert.equal(result.summary.hasSeqScan, true);
  assert.equal(result.bottlenecks.length, 1);
  assert.ok(result.root.issues[0].includes('Sequential Scan'));
  assert.ok(result.root.recommendation?.includes('Create an index'));
});

test('parseExplainAnalyze parses nested plans and calculates total cost/time', () => {
  const result = parseExplainAnalyze(SAMPLE_EXPLAIN_PLANS[1].json);
  assert.equal(result.root.nodeType, 'Sort');
  assert.equal(result.root.severity, 'warning');
  assert.equal(result.root.children.length, 1);
  assert.equal(result.root.children[0].nodeType, 'Nested Loop');
  assert.equal(result.root.children[0].children.length, 2);
  assert.equal(result.summary.hasHighCostSort, true);
});

test('parseExplainAnalyze handles text format explain cleanly', () => {
  const text = `
    -> Seq Scan on customers (cost=0.00..450.00 rows=5000) (actual time=0.04..18.2 rows=4900 loops=1)
  `;
  const result = parseExplainAnalyze(text);
  assert.equal(result.root.nodeType, 'Seq Scan');
  assert.equal(result.root.relationName, 'customers');
  assert.equal(result.root.severity, 'critical');
});
