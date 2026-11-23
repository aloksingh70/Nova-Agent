import type { SchemaDiffResult } from './schemaDiff';
import { parseSqlDdl } from './sqlDdlParser';

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

export interface MigrationHazard {
  id: string;
  risk: RiskLevel;
  title: string;
  description: string;
  mitigation: string;
  target: string;
}

export interface MigrationSafetyReport {
  score: number; // 0 (dangerous) to 100 (safe)
  status: 'safe' | 'caution' | 'destructive';
  hazards: MigrationHazard[];
  summary: {
    criticalCount: number;
    highCount: number;
    mediumCount: number;
  };
}

/**
 * Inspects a schema diff result for breaking or destructive changes.
 */
export function checkMigrationSafety(diff: SchemaDiffResult): MigrationSafetyReport {
  const hazards: MigrationHazard[] = [];

  // 1. Dropped tables
  for (const t of diff.tables) {
    if (t.status === 'removed') {
      hazards.push({
        id: `drop_table_${t.name}`,
        risk: 'critical',
        title: `DROP TABLE ${t.name}`,
        description: `Permanently deletes table "${t.name}" and all historical data rows contained within it.`,
        mitigation: 'Archive data to cold storage or rename to legacy_ before dropping in a separate release.',
        target: t.name,
      });
    }

    if (t.status === 'modified') {
      for (const col of t.columns) {
        // 2. Dropped columns
        if (col.status === 'removed') {
          hazards.push({
            id: `drop_col_${t.name}_${col.name}`,
            risk: 'critical',
            title: `DROP COLUMN ${t.name}.${col.name}`,
            description: `Permanently drops column "${col.name}" from table "${t.name}". Existing values cannot be recovered.`,
            mitigation: 'Deprecate column in application code first, verify 0 reads/writes, then execute drop.',
            target: `${t.name}.${col.name}`,
          });
        }

        // 3. Narrowed column type
        if (col.status === 'modified' && col.before && col.after) {
          const btype = col.before.type.toUpperCase();
          const atype = col.after.type.toUpperCase();

          const bLenMatch = btype.match(/VARCHAR\((\d+)\)/);
          const aLenMatch = atype.match(/VARCHAR\((\d+)\)/);

          if (bLenMatch && aLenMatch) {
            const bLen = parseInt(bLenMatch[1], 10);
            const aLen = parseInt(aLenMatch[1], 10);
            if (aLen < bLen) {
              hazards.push({
                id: `narrow_col_${t.name}_${col.name}`,
                risk: 'high',
                title: `Type Narrowing: ${t.name}.${col.name} (${btype} → ${atype})`,
                description: `Shortening maximum character length will truncate strings exceeding ${aLen} characters.`,
                mitigation: `Run "SELECT MAX(LENGTH(${col.name})) FROM ${t.name}" before migrating to confirm no strings exceed ${aLen}.`,
                target: `${t.name}.${col.name}`,
              });
            }
          }

          // 4. Added NOT NULL without DEFAULT
          if (col.before.isNullable && !col.after.isNullable) {
            hazards.push({
              id: `not_null_${t.name}_${col.name}`,
              risk: 'high',
              title: `Adding NOT NULL constraint to ${t.name}.${col.name}`,
              description: `Applying NOT NULL without a backfill or default will fail immediately if table contains NULL rows.`,
              mitigation: `Backfill existing NULL values with a default value before applying NOT NULL constraint.`,
              target: `${t.name}.${col.name}`,
            });
          }
        }

        // 5. Added new NOT NULL column without DEFAULT
        if (col.status === 'added' && col.after && !col.after.isNullable && !col.after.isPrimaryKey) {
          hazards.push({
            id: `add_not_null_${t.name}_${col.name}`,
            risk: 'medium',
            title: `New NOT NULL column ${t.name}.${col.name} without explicit DEFAULT`,
            description: `On non-empty tables, adding a NOT NULL column requires a DEFAULT value or PostgreSQL/MySQL will reject it or acquire an exclusive table lock.`,
            mitigation: `Add "DEFAULT '<value>'" to the ADD COLUMN statement.`,
            target: `${t.name}.${col.name}`,
          });
        }
      }
    }
  }

  const criticalCount = hazards.filter((h) => h.risk === 'critical').length;
  const highCount = hazards.filter((h) => h.risk === 'high').length;
  const mediumCount = hazards.filter((h) => h.risk === 'medium').length;

  // Calculate score from 100
  let deduction = criticalCount * 40 + highCount * 25 + mediumCount * 10;
  const score = Math.max(0, 100 - deduction);

  const status = score < 50 ? 'destructive' : score < 80 ? 'caution' : 'safe';

  return {
    score,
    status,
    hazards,
    summary: {
      criticalCount,
      highCount,
      mediumCount,
    },
  };
}

/**
 * Generates an exact Down (rollback) migration script reversing all changes from a SchemaDiffResult.
 */
export function generateRollbackScript(diff: SchemaDiffResult, dialect: string = 'postgresql'): string {
  const lines: string[] = [
    `-- ========================================================`,
    `-- NOVA AGENT: Automated Down Rollback Migration (migrate.down.sql)`,
    `-- Dialect: ${dialect.toUpperCase()}`,
    `-- ========================================================`,
    '',
  ];

  // 1. Rollback dropped tables (re-create them if before metadata exists)
  for (const t of diff.tables) {
    if (t.status === 'removed') {
      const cols = t.columns.map((c) => {
        const col = c.before!;
        return `  ${col.name} ${col.type}${col.isPrimaryKey ? ' PRIMARY KEY' : ''}${!col.isNullable && !col.isPrimaryKey ? ' NOT NULL' : ''}`;
      });
      lines.push(`-- Rollback DROP TABLE ${t.name}`);
      lines.push(`CREATE TABLE IF NOT EXISTS ${t.name} (\n${cols.join(',\n')}\n);\n`);
    }
  }

  // 2. Rollback newly added tables (drop them)
  for (const t of diff.tables) {
    if (t.status === 'added') {
      lines.push(`-- Rollback CREATE TABLE ${t.name}`);
      lines.push(`DROP TABLE IF EXISTS ${t.name} CASCADE;\n`);
    }
  }

  // 3. Rollback column additions & removals
  for (const t of diff.tables) {
    if (t.status === 'modified') {
      for (const col of t.columns) {
        if (col.status === 'added' && col.after) {
          lines.push(`-- Rollback ADD COLUMN ${t.name}.${col.after.name}`);
          lines.push(`ALTER TABLE ${t.name} DROP COLUMN IF EXISTS ${col.after.name};\n`);
        } else if (col.status === 'removed' && col.before) {
          lines.push(`-- Rollback DROP COLUMN ${t.name}.${col.before.name}`);
          lines.push(`ALTER TABLE ${t.name} ADD COLUMN ${col.before.name} ${col.before.type};\n`);
        } else if (col.status === 'modified' && col.before) {
          lines.push(`-- Rollback ALTER COLUMN ${t.name}.${col.name}`);
          lines.push(`ALTER TABLE ${t.name} ALTER COLUMN ${col.name} TYPE ${col.before.type};\n`);
        }
      }
    }
  }

  return lines.join('\n');
}

/**
 * Converts SQL DDL statements into Prisma, Drizzle ORM, or TypeORM model exports.
 */
export function exportDdlToORM(ddl: string, orm: 'prisma' | 'drizzle' | 'typeorm'): string {
  const parsed = parseSqlDdl(ddl);
  const entities = parsed.diagram.entities;
  if (!entities || entities.length === 0) {
    return '// No valid SQL tables found to convert.';
  }

  if (orm === 'prisma') {
    const lines: string[] = [
      `// Prisma Schema Generated by NOVA AGENT`,
      `generator client {`,
      `  provider = "prisma-client-js"`,
      `}`,
      ``,
      `datasource db {`,
      `  provider = "postgresql"`,
      `  url      = env("DATABASE_URL")`,
      `}`,
      ``,
    ];

    for (const ent of entities) {
      const modelName = ent.name.charAt(0).toUpperCase() + ent.name.slice(1);
      lines.push(`model ${modelName} {`);
      for (const col of ent.columns) {
        let pType = 'String';
        const t = col.type.toLowerCase();
        if (t.includes('int')) pType = 'Int';
        else if (t.includes('float') || t.includes('decimal') || t.includes('numeric')) pType = 'Float';
        else if (t.includes('bool')) pType = 'Boolean';
        else if (t.includes('time') || t.includes('date')) pType = 'DateTime';
        else if (t.includes('json')) pType = 'Json';

        const optional = col.isNullable ? '?' : '';
        const attributes: string[] = [];
        if (col.isPrimaryKey) {
          attributes.push('@id');
          if (t.includes('uuid')) attributes.push('@default(uuid())');
          else if (t.includes('serial') || t.includes('int')) attributes.push('@default(autoincrement())');
        } else if (col.isUnique) {
          attributes.push('@unique');
        }

        const attrPart = attributes.length > 0 ? ` ${attributes.join(' ')}` : '';
        lines.push(`  ${col.name.padEnd(16)} ${pType}${optional}${attrPart}`);
      }
      lines.push(`  @@map("${ent.name}")`);
      lines.push(`}\n`);
    }
    return lines.join('\n');
  }

  if (orm === 'drizzle') {
    const lines: string[] = [
      `// Drizzle ORM Schema Generated by NOVA AGENT`,
      `import { pgTable, uuid, varchar, text, integer, timestamp, boolean, decimal } from 'drizzle-orm/pg-core';`,
      ``,
    ];

    for (const ent of entities) {
      lines.push(`export const ${ent.name} = pgTable('${ent.name}', {`);
      for (const col of ent.columns) {
        const t = col.type.toLowerCase();
        let colDecl = `text('${col.name}')`;
        if (t.includes('uuid')) colDecl = `uuid('${col.name}')`;
        else if (t.includes('varchar')) colDecl = `varchar('${col.name}', { length: 255 })`;
        else if (t.includes('int')) colDecl = `integer('${col.name}')`;
        else if (t.includes('bool')) colDecl = `boolean('${col.name}')`;
        else if (t.includes('date') || t.includes('time')) colDecl = `timestamp('${col.name}')`;

        if (col.isPrimaryKey) colDecl += '.primaryKey()';
        if (!col.isNullable && !col.isPrimaryKey) colDecl += '.notNull()';
        if (col.isUnique && !col.isPrimaryKey) colDecl += '.unique()';

        lines.push(`  ${col.name}: ${colDecl},`);
      }
      lines.push(`});\n`);
    }
    return lines.join('\n');
  }

  // TypeORM
  const lines: string[] = [
    `// TypeORM Entity Definitions Generated by NOVA AGENT`,
    `import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';`,
    ``,
  ];

  for (const ent of entities) {
    const className = ent.name.charAt(0).toUpperCase() + ent.name.slice(1);
    lines.push(`@Entity('${ent.name}')`);
    lines.push(`export class ${className} {`);
    for (const col of ent.columns) {
      if (col.isPrimaryKey) {
        const t = col.type.toLowerCase();
        lines.push(`  @PrimaryGeneratedColumn(${t.includes('uuid') ? "'uuid'" : ''})`);
        lines.push(`  ${col.name}: ${t.includes('uuid') ? 'string' : 'number'};\n`);
      } else {
        const t = col.type.toLowerCase();
        let jsType = 'string';
        if (t.includes('int') || t.includes('decimal')) jsType = 'number';
        else if (t.includes('bool')) jsType = 'boolean';
        else if (t.includes('date') || t.includes('time')) jsType = 'Date';

        const opts: string[] = [];
        if (col.isNullable) opts.push('nullable: true');
        if (col.isUnique) opts.push('unique: true');
        const optStr = opts.length > 0 ? `{ ${opts.join(', ')} }` : '';

        lines.push(`  @Column(${optStr})`);
        lines.push(`  ${col.name}: ${jsType};\n`);
      }
    }
    lines.push(`}\n`);
  }
  return lines.join('\n');
}
