import test from 'node:test';
import assert from 'node:assert/strict';
import { addRecentQuery, getRecentQueries, clearRecentQueries } from './recentQueries';

// Mock localStorage for Node test runner
const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => storageMap.get(k) ?? null,
  setItem: (k: string, v: string) => storageMap.set(k, v),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

test('addRecentQuery caches up to 10 queries without duplicates', () => {
  storageMap.clear();

  for (let i = 1; i <= 12; i++) {
    addRecentQuery(`SELECT * FROM table_${i};`, { dialect: 'postgresql' });
  }

  const queries = getRecentQueries();
  assert.equal(queries.length, 10);
  assert.equal(queries[0].sql, 'SELECT * FROM table_12;');
  assert.equal(queries[9].sql, 'SELECT * FROM table_3;');

  // Re-adding table_12 moves it to the front without increasing length
  addRecentQuery('SELECT * FROM table_12;', { dialect: 'postgresql' });
  const updated = getRecentQueries();
  assert.equal(updated.length, 10);
  assert.equal(updated[0].sql, 'SELECT * FROM table_12;');
});

test('clearRecentQueries clears stored items', () => {
  addRecentQuery('SELECT 1;');
  assert.ok(getRecentQueries().length > 0);
  clearRecentQueries();
  assert.equal(getRecentQueries().length, 0);
});
