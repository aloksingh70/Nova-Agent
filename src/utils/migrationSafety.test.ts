import test from 'node:test';
import assert from 'node:assert/strict';
import { diffSqlSchemas, SCHEMA_DIFF_PRESETS } from './schemaDiff';
import { checkMigrationSafety, generateRollbackScript, exportDdlToORM } from './migrationSafety';

test('checkMigrationSafety flags DROP TABLE legacy_discounts as critical hazard', () => {
  const preset = SCHEMA_DIFF_PRESETS[0];
  const diff = diffSqlSchemas(preset.baseDdl, preset.targetDdl);
  const safety = checkMigrationSafety(diff);

  assert.ok(safety.score < 80);
  assert.equal(safety.summary.criticalCount >= 1, true);
  const droppedTableHazard = safety.hazards.find((h) => h.title.includes('DROP TABLE legacy_discounts'));
  assert.ok(droppedTableHazard);
  assert.equal(droppedTableHazard.risk, 'critical');
});

test('generateRollbackScript creates valid Down rollback DDL', () => {
  const preset = SCHEMA_DIFF_PRESETS[0];
  const diff = diffSqlSchemas(preset.baseDdl, preset.targetDdl);
  const rollback = generateRollbackScript(diff, 'postgresql');

  assert.ok(rollback.includes('migrate.down.sql'));
  assert.ok(rollback.includes('CREATE TABLE IF NOT EXISTS legacy_discounts'));
  assert.ok(rollback.includes('DROP TABLE IF EXISTS subscriptions'));
});

test('exportDdlToORM converts CREATE TABLE DDL to Prisma, Drizzle, and TypeORM', () => {
  const ddl = `
    CREATE TABLE users (
      id UUID PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );
  `;
  const prisma = exportDdlToORM(ddl, 'prisma');
  assert.ok(prisma.includes('model Users'));
  assert.ok(prisma.includes('@id'));
  assert.ok(prisma.includes('@unique'));

  const drizzle = exportDdlToORM(ddl, 'drizzle');
  assert.ok(drizzle.includes('export const users = pgTable'));
  assert.ok(drizzle.includes('.primaryKey()'));

  const typeorm = exportDdlToORM(ddl, 'typeorm');
  assert.ok(typeorm.includes('@Entity(\'users\')'));
  assert.ok(typeorm.includes('@PrimaryGeneratedColumn'));
});
