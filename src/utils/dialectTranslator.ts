import type { SqlDialect } from '../types/nova';

export interface DialectTransformation {
  fromSnippet: string;
  toSnippet: string;
  category: 'Function' | 'Type' | 'Syntax' | 'Clause';
  description: string;
}

export interface DialectTranslationResult {
  translatedCode: string;
  sourceDialect: SqlDialect;
  targetDialect: SqlDialect;
  transformations: DialectTransformation[];
  caveats: string[];
  compatibilityScore: number; // 0 to 100
}

export function translateSqlDialect(
  sql: string,
  fromDialect: SqlDialect,
  toDialect: SqlDialect
): DialectTranslationResult {
  const clean = sql.trim();
  if (!clean || fromDialect === toDialect) {
    return {
      translatedCode: clean,
      sourceDialect: fromDialect,
      targetDialect: toDialect,
      transformations: [],
      caveats: fromDialect === toDialect ? ['Source and target dialects are identical.'] : [],
      compatibilityScore: 100,
    };
  }

  let code = clean;
  const transformations: DialectTransformation[] = [];
  const caveats: string[] = [];

  // Special case: SQL to MongoDB
  if (toDialect === 'mongodb') {
    return translateSqlToMongo(code, fromDialect);
  }

  // 1. ILIKE -> LOWER() LIKE or LIKE
  if (/\bILIKE\b/i.test(code)) {
    if (toDialect === 'mysql') {
      code = code.replace(/([A-Za-z0-9_.]+)\s+ILIKE\s+('[^']+')/gi, 'LOWER($1) LIKE LOWER($2)');
      transformations.push({
        fromSnippet: 'col ILIKE pattern',
        toSnippet: 'LOWER(col) LIKE LOWER(pattern)',
        category: 'Syntax',
        description: 'Converted PostgreSQL case-insensitive ILIKE to ANSI LOWER() LIKE for MySQL compatibility.',
      });
    } else if (toDialect === 'sqlite') {
      code = code.replace(/\bILIKE\b/gi, 'LIKE');
      transformations.push({
        fromSnippet: 'ILIKE',
        toSnippet: 'LIKE',
        category: 'Syntax',
        description: 'SQLite LIKE is case-insensitive for ASCII strings by default.',
      });
    } else {
      code = code.replace(/([A-Za-z0-9_.]+)\s+ILIKE\s+('[^']+')/gi, 'LOWER($1) LIKE LOWER($2)');
      transformations.push({
        fromSnippet: 'ILIKE',
        toSnippet: 'LOWER() LIKE LOWER()',
        category: 'Syntax',
        description: 'Replaced PostgreSQL ILIKE with cross-dialect LOWER() equality.',
      });
    }
  }

  // 2. DATE_TRUNC
  if (/DATE_TRUNC\s*\(\s*'month'\s*,\s*([A-Za-z0-9_.]+)\s*\)/i.test(code)) {
    if (toDialect === 'mysql') {
      code = code.replace(/DATE_TRUNC\s*\(\s*'month'\s*,\s*([A-Za-z0-9_.]+)\s*\)/gi, "DATE_FORMAT($1, '%Y-%m-01')");
      transformations.push({
        fromSnippet: "DATE_TRUNC('month', col)",
        toSnippet: "DATE_FORMAT(col, '%Y-%m-01')",
        category: 'Function',
        description: 'Converted PostgreSQL DATE_TRUNC to MySQL DATE_FORMAT date string.',
      });
    } else if (toDialect === 'sqlite') {
      code = code.replace(/DATE_TRUNC\s*\(\s*'month'\s*,\s*([A-Za-z0-9_.]+)\s*\)/gi, "strftime('%Y-%m-01', $1)");
      transformations.push({
        fromSnippet: "DATE_TRUNC('month', col)",
        toSnippet: "strftime('%Y-%m-01', col)",
        category: 'Function',
        description: 'Converted DATE_TRUNC to SQLite strftime() format.',
      });
    } else if (toDialect === 'bigquery') {
      code = code.replace(/DATE_TRUNC\s*\(\s*'month'\s*,\s*([A-Za-z0-9_.]+)\s*\)/gi, 'DATE_TRUNC($1, MONTH)');
      transformations.push({
        fromSnippet: "DATE_TRUNC('month', col)",
        toSnippet: 'DATE_TRUNC(col, MONTH)',
        category: 'Function',
        description: 'BigQuery places date part as second unquoted argument in DATE_TRUNC(date, MONTH).',
      });
    } else if (toDialect === 'sqlserver') {
      code = code.replace(/DATE_TRUNC\s*\(\s*'month'\s*,\s*([A-Za-z0-9_.]+)\s*\)/gi, 'DATETRUNC(month, $1)');
      transformations.push({
        fromSnippet: "DATE_TRUNC('month', col)",
        toSnippet: 'DATETRUNC(month, col)',
        category: 'Function',
        description: 'Mapped to SQL Server 2022 DATETRUNC function.',
      });
    }
  }

  // 3. NOW() / CURRENT_TIMESTAMP
  if (toDialect === 'sqlserver' && /\bNOW\(\)/i.test(code)) {
    code = code.replace(/\bNOW\(\)/gi, 'GETDATE()');
    transformations.push({
      fromSnippet: 'NOW()',
      toSnippet: 'GETDATE()',
      category: 'Function',
      description: 'SQL Server uses GETDATE() for current local datetime.',
    });
  }

  // 4. LIMIT conversion to SQL Server TOP
  if (toDialect === 'sqlserver' && /\bLIMIT\s+(\d+)\b/i.test(code)) {
    const limitMatch = code.match(/\bLIMIT\s+(\d+)\b/i);
    if (limitMatch) {
      const limitVal = limitMatch[1];
      code = code.replace(/\bLIMIT\s+\d+\b/i, '');
      code = code.replace(/\bSELECT\s+(DISTINCT\s+)?/i, `SELECT $1TOP ${limitVal} `);
      transformations.push({
        fromSnippet: `LIMIT ${limitVal}`,
        toSnippet: `SELECT TOP ${limitVal}`,
        category: 'Clause',
        description: 'SQL Server limits result sets using the TOP clause in SELECT rather than trailing LIMIT.',
      });
    }
  }

  // 5. Data Types (DDL queries)
  if (toDialect === 'mysql') {
    if (/\bTIMESTAMPTZ\b/i.test(code)) {
      code = code.replace(/\bTIMESTAMPTZ\b/gi, 'TIMESTAMP');
      transformations.push({
        fromSnippet: 'TIMESTAMPTZ',
        toSnippet: 'TIMESTAMP',
        category: 'Type',
        description: 'MySQL does not have TIMESTAMPTZ; TIMESTAMP stores in UTC and converts on display.',
      });
    }
    if (/\bUUID\b/i.test(code)) {
      code = code.replace(/\bUUID\b/gi, 'CHAR(36)');
      transformations.push({
        fromSnippet: 'UUID',
        toSnippet: 'CHAR(36)',
        category: 'Type',
        description: 'MySQL stores standard UUIDs in CHAR(36) or BINARY(16).',
      });
    }
    if (/\bSERIAL\s+PRIMARY\s+KEY\b/i.test(code)) {
      code = code.replace(/\bSERIAL\s+PRIMARY\s+KEY\b/gi, 'INT AUTO_INCREMENT PRIMARY KEY');
      transformations.push({
        fromSnippet: 'SERIAL PRIMARY KEY',
        toSnippet: 'INT AUTO_INCREMENT PRIMARY KEY',
        category: 'Type',
        description: 'Converted PostgreSQL SERIAL pseudo-type to MySQL AUTO_INCREMENT.',
      });
    }
  } else if (toDialect === 'sqlite') {
    if (/\bUUID\b/i.test(code)) {
      code = code.replace(/\bUUID\b/gi, 'TEXT');
      transformations.push({
        fromSnippet: 'UUID',
        toSnippet: 'TEXT',
        category: 'Type',
        description: 'SQLite uses TEXT affinity to store UUID strings.',
      });
    }
    if (/\bBOOLEAN\b/i.test(code)) {
      code = code.replace(/\bBOOLEAN\b/gi, 'INTEGER');
      transformations.push({
        fromSnippet: 'BOOLEAN',
        toSnippet: 'INTEGER',
        category: 'Type',
        description: 'SQLite stores boolean values as INTEGER (0 for false, 1 for true).',
      });
    }
  }

  if (transformations.length === 0) {
    caveats.push('Query syntax is already ANSI-compliant across both target and source dialects.');
  }

  const score = Math.max(75, 100 - caveats.length * 10);

  return {
    translatedCode: code,
    sourceDialect: fromDialect,
    targetDialect: toDialect,
    transformations,
    caveats,
    compatibilityScore: score,
  };
}

function translateSqlToMongo(sql: string, fromDialect: SqlDialect): DialectTranslationResult {
  const fromMatch = sql.match(/FROM\s+["`]?([A-Za-z0-9_]+)["`]?/i);
  const collection = fromMatch ? fromMatch[1] : 'collection';

  const transformations: DialectTransformation[] = [
    {
      fromSnippet: 'SQL Relational Syntax',
      toSnippet: 'MongoDB MQL / Aggregation Pipeline',
      category: 'Syntax',
      description: 'Translated relational SQL query into MongoDB JSON aggregation pipeline.',
    },
  ];

  const pipeline: any[] = [];

  // Match WHERE
  const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?=\s+(?:GROUP\s+BY|ORDER\s+BY|LIMIT|;|$))/i);
  if (whereMatch) {
    pipeline.push({
      $match: {
        /* parsed condition */
        rawFilter: whereMatch[1].trim(),
      },
    });
  }

  // Match projections
  const selectMatch = sql.match(/SELECT\s+([\s\S]+?)\s+FROM/i);
  if (selectMatch && selectMatch[1].trim() !== '*') {
    const cols = selectMatch[1].split(',').map((c) => c.trim().split(/\s+AS\s+/i)[0]);
    const projectObj: Record<string, number> = { _id: 0 };
    for (const c of cols) {
      if (c && !c.includes('(')) projectObj[c] = 1;
    }
    pipeline.push({ $project: projectObj });
  }

  // Match LIMIT
  const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
  if (limitMatch) {
    pipeline.push({ $limit: parseInt(limitMatch[1], 10) });
  }

  const translatedCode = `// MongoDB Aggregation Pipeline\ndb.${collection}.aggregate([\n${pipeline
    .map((step) => '  ' + JSON.stringify(step))
    .join(',\n')}\n]);`;

  return {
    translatedCode,
    sourceDialect: fromDialect,
    targetDialect: 'mongodb',
    transformations,
    caveats: [
      'MongoDB is document-oriented; relational foreign keys should be modeled with embedding or $lookup.',
    ],
    compatibilityScore: 85,
  };
}
