import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPrismTokenClass,
  highlightCodeWithPrism,
  resolvePrismLanguage,
} from './prismHighlight';

test('resolvePrismLanguage maps SQL, NoSQL, MongoDB, JSON, Cypher, GraphQL, and Mermaid aliases', () => {
  assert.equal(resolvePrismLanguage('postgresql'), 'sql');
  assert.equal(resolvePrismLanguage('mysql'), 'sql');
  assert.equal(resolvePrismLanguage('mongodb'), 'mongodb');
  assert.equal(resolvePrismLanguage('nosql'), 'mongodb');
  assert.equal(resolvePrismLanguage('bson'), 'json');
  assert.equal(resolvePrismLanguage('mmd'), 'mermaid');
  assert.equal(resolvePrismLanguage('cypher'), 'cypher');
  assert.equal(resolvePrismLanguage('graphql'), 'graphql');
});

test('highlightCodeWithPrism tokenizes SQL keywords, strings, numbers, and comments faithfully', () => {
  const sql = "-- Active orders\nSELECT id, total_cents FROM orders WHERE status = 'paid' AND total_cents > 500;";
  const segments = highlightCodeWithPrism(sql, 'postgresql');

  // Reconstructed text must match original source identically
  assert.equal(segments.map((s) => s.content).join(''), sql);
  assert.ok(segments.some((s) => s.type === 'comment' && s.content.includes('-- Active orders')));
  assert.ok(segments.some((s) => s.type === 'keyword' && s.content === 'SELECT'));
  assert.ok(segments.some((s) => s.type === 'string' && s.content === "'paid'"));
  assert.ok(segments.some((s) => s.type === 'number' && s.content === '500'));
});

test('highlightCodeWithPrism highlights MongoDB NoSQL aggregation pipelines with operators and keywords', () => {
  const mongo = 'db.orders.aggregate([{ $match: { status: "paid" } }, { $group: { _id: "$customer_id", total: { $sum: "$amount" } } }])';
  const segments = highlightCodeWithPrism(mongo, 'mongodb');

  assert.equal(segments.map((s) => s.content).join(''), mongo);
  assert.ok(segments.some((s) => s.content === '$match' && s.type !== 'plain'));
  assert.ok(segments.some((s) => s.content === '"paid"' && s.type === 'string'));
  assert.ok(segments.some((s) => s.content === 'aggregate' && s.type === 'function'));
});

test('highlightCodeWithPrism tokenizes JSON and Mermaid snippets and maps token classes', () => {
  const json = '{"index": "idx_orders_created", "cost": 4.2, "used": true}';
  const jsonSegs = highlightCodeWithPrism(json, 'json');
  assert.equal(jsonSegs.map((s) => s.content).join(''), json);
  assert.ok(jsonSegs.some((s) => s.type === 'property'));
  assert.ok(jsonSegs.some((s) => s.type === 'number' && s.content === '4.2'));
  assert.ok(jsonSegs.some((s) => s.type === 'boolean' && s.content === 'true'));

  const mmd = 'erDiagram\n  USERS ||--o{ ORDERS : places';
  const mmdSegs = highlightCodeWithPrism(mmd, 'mermaid');
  assert.equal(mmdSegs.map((s) => s.content).join(''), mmd);
  assert.ok(mmdSegs.length > 1);

  assert.match(getPrismTokenClass('keyword'), /text-\[#ff8a3d\]/);
  assert.match(getPrismTokenClass('function'), /text-\[#7dd3fc\]/);
  assert.match(getPrismTokenClass('property'), /text-\[#c4b5fd\]/);
});
