import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemorySqlDatabase, generateRealisticSeedData } from './inMemorySqlEngine';

test('InMemorySqlDatabase executes CREATE TABLE, INSERT INTO and SELECT with WHERE and ORDER BY', () => {
  const db = new InMemorySqlDatabase();

  const ddl = `
    CREATE TABLE users (
      id INT PRIMARY KEY,
      name VARCHAR(50),
      salary INT
    );
  `;
  const res1 = db.execute(ddl);
  assert.equal(res1.error, undefined);
  assert.equal(db.getTableNames().includes('users'), true);

  const insert = `
    INSERT INTO users (id, name, salary) VALUES
      (1, 'Alice', 95000),
      (2, 'Bob', 82000),
      (3, 'Charlie', 110000);
  `;
  const res2 = db.execute(insert);
  assert.equal(res2.error, undefined);
  assert.equal(res2.rowCount, 3);

  const query = `
    SELECT id, name, salary
    FROM users
    WHERE salary > 85000
    ORDER BY salary DESC;
  `;
  const res3 = db.execute(query);
  assert.equal(res3.error, undefined);
  assert.equal(res3.rowCount, 2);
  assert.deepEqual(res3.columns, ['id', 'name', 'salary']);
  assert.deepEqual(res3.rows[0], [3, 'Charlie', 110000]);
  assert.deepEqual(res3.rows[1], [1, 'Alice', 95000]);
});

test('InMemorySqlDatabase computes aggregate functions COUNT and SUM', () => {
  const db = new InMemorySqlDatabase();
  db.execute(`
    CREATE TABLE orders (id INT, amount INT);
    INSERT INTO orders (id, amount) VALUES (1, 100), (2, 250), (3, 50);
  `);

  const agg = db.execute('SELECT COUNT(*) AS total_orders, SUM(amount) AS total_amount FROM orders;');
  assert.equal(agg.error, undefined);
  assert.equal(agg.rowCount, 1);
  assert.deepEqual(agg.columns, ['total_orders', 'total_amount']);
  assert.deepEqual(agg.rows[0], [3, 400]);
});

test('generateRealisticSeedData creates realistic mock inserts for given DDL', () => {
  const ddl = `
    CREATE TABLE customers (
      id INT PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL
    );
  `;
  const seeds = generateRealisticSeedData(ddl);
  assert.ok(seeds.includes('INSERT INTO customers'));
  assert.ok(seeds.includes('@example.com'));
});
