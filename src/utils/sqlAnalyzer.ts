export type DiagnosticCategory = 'Efficiency' | 'Clarity' | 'Result Mismatch' | 'Syntax';
export type DiagnosticSeverity = 'Critical' | 'Warning' | 'Suggestion';

export interface StaticSqlFinding {
  id: string;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  title: string;
  clause: string;
  whyItMatters: string;
  suggestion: string;
}

export interface SqlDiffLine {
  kind: 'same' | 'removed' | 'added';
  text: string;
}

export interface StaticAnalysisResult {
  findings: StaticSqlFinding[];
  suggestedSql: string;
  diffLines: SqlDiffLine[];
  stats: {
    lineCount: number;
    joinCount: number;
    subqueryCount: number;
    issueCount: number;
    criticalCount: number;
  };
  mismatchHints: string[];
}

/**
 * Pure, deterministic static analyzer for SQL clarity, efficiency, and
 * common result-mismatch bugs (why a query returns 0 rows, missing rows, or duplicates).
 */
export function analyzeSqlQuery(
  rawSql: string,
  options?: { expectedBehavior?: string; actualIssue?: string }
): StaticAnalysisResult {
  const sql = rawSql.trim();
  const findings: StaticSqlFinding[] = [];
  let suggestedSql = sql;

  if (!sql) {
    return {
      findings: [],
      suggestedSql: '',
      diffLines: [],
      stats: { lineCount: 0, joinCount: 0, subqueryCount: 0, issueCount: 0, criticalCount: 0 },
      mismatchHints: [],
    };
  }

  // 1. Unbalanced parentheses check
  let depth = 0;
  let unbalanced = false;
  for (const ch of sql) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth < 0) {
      unbalanced = true;
      break;
    }
  }
  if (depth !== 0) unbalanced = true;
  if (unbalanced) {
    findings.push({
      id: 'syntax-parens',
      category: 'Syntax',
      severity: 'Critical',
      title: 'Unbalanced parentheses detected',
      clause: 'Expression / Subquery',
      whyItMatters:
        'Mismatched opening and closing parentheses cause immediate SQL parser syntax errors.',
      suggestion: 'Verify every opening "(" in CTEs, function calls, and subqueries has a matching ")".',
    });
  }

  // 2. = NULL or != NULL / <> NULL (always evaluates to UNKNOWN -> 0 rows!)
  if (/(?:=|!=|<>)\s*NULL\b/i.test(sql)) {
    findings.push({
      id: 'mismatch-eq-null',
      category: 'Result Mismatch',
      severity: 'Critical',
      title: 'Direct comparison with NULL (= NULL or != NULL)',
      clause: 'WHERE / ON predicate',
      whyItMatters:
        'In SQL three-valued logic, comparing any value with "= NULL" or "!= NULL" evaluates to UNKNOWN (never TRUE), silently dropping all matching rows.',
      suggestion: 'Replace "= NULL" with "IS NULL" and "!= NULL" / "<> NULL" with "IS NOT NULL".',
    });
    suggestedSql = suggestedSql
      .replace(/(!=|<>)\s*NULL\b/gi, 'IS NOT NULL')
      .replace(/=\s*NULL\b/gi, 'IS NULL');
  }

  // 3. LEFT JOIN nullified by WHERE clause on right-hand table
  const leftJoinMatch = sql.match(
    /\bLEFT\s+(?:OUTER\s+)?JOIN\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*))?\s+ON\b/i
  );
  if (leftJoinMatch && /\bWHERE\b/i.test(sql)) {
    const rightAlias = leftJoinMatch[2] || leftJoinMatch[1];
    const wherePart = sql.slice(sql.search(/\bWHERE\b/i));
    const aliasFilterRe = new RegExp(
      `\\b${rightAlias}\\.[A-Za-z_][A-Za-z0-9_]*\\s*(?:=|!=|<>|>|<|>=|<=|LIKE|ILIKE|IN\\b)`,
      'i'
    );
    const checksIsNull = new RegExp(`\\b${rightAlias}\\.[A-Za-z_][A-Za-z0-9_]*\\s+IS\\s+NULL\\b`, 'i');
    if (aliasFilterRe.test(wherePart) && !checksIsNull.test(wherePart)) {
      findings.push({
        id: 'mismatch-left-join-where',
        category: 'Result Mismatch',
        severity: 'Critical',
        title: `WHERE filter on "${rightAlias}" converts LEFT JOIN into INNER JOIN`,
        clause: 'LEFT JOIN + WHERE',
        whyItMatters:
          'Rows from the left table with no match have NULLs for the right table. Filtering the right table in WHERE discards those NULL rows, causing unmatched records to vanish.',
        suggestion: `Move the "${rightAlias}.*" predicate into the LEFT JOIN ... ON clause (or allow "${rightAlias}.<col> IS NULL").`,
      });
    }
  }

  // 4. Aggregate function inside WHERE clause
  if (/\bWHERE\b[\s\S]*?\b(?:COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(sql)) {
    const whereSlice = sql.slice(sql.search(/\bWHERE\b/i));
    const beforeGroup = whereSlice.split(/\b(?:GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT)\b/i)[0];
    if (/\b(?:COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(beforeGroup)) {
      findings.push({
        id: 'syntax-agg-in-where',
        category: 'Syntax',
        severity: 'Critical',
        title: 'Aggregate function used inside WHERE clause',
        clause: 'WHERE',
        whyItMatters:
          'WHERE filters individual rows before grouping occurs, so database engines reject aggregate expressions like AVG() or SUM() inside WHERE.',
        suggestion: 'Move aggregate conditions into a HAVING clause after GROUP BY.',
      });
    }
  }

  // 5. NOT IN (SELECT ...) NULL trap
  if (/\bNOT\s+IN\s*\(\s*SELECT\b/i.test(sql)) {
    findings.push({
      id: 'mismatch-not-in-subquery',
      category: 'Result Mismatch',
      severity: 'Warning',
      title: 'NOT IN (SELECT ...) silently returns 0 rows if subquery yields any NULL',
      clause: 'WHERE NOT IN',
      whyItMatters:
        'If the inner subquery returns even a single NULL, every comparison becomes UNKNOWN and the outer query returns an empty result set.',
      suggestion: 'Rewrite using NOT EXISTS (...) or add "WHERE col IS NOT NULL" inside the subquery.',
    });
  }

  // 6. Non-SARGable functions in WHERE (YEAR, MONTH, EXTRACT, LOWER, UPPER, SUBSTRING)
  const nonSargMatch = sql.match(
    /\bWHERE\b[\s\S]*?\b(YEAR|MONTH|DATE|EXTRACT|LOWER|UPPER|SUBSTRING|COALESCE)\s*\(/i
  );
  if (nonSargMatch) {
    const fnName = nonSargMatch[1].toUpperCase();
    findings.push({
      id: 'efficiency-non-sargable',
      category: 'Efficiency',
      severity: 'Warning',
      title: `Non-SARGable function ${fnName}() in WHERE predicate`,
      clause: `WHERE ${fnName}(...)`,
      whyItMatters:
        'Wrapping an indexed column in a scalar function forces a full table or index scan because the planner cannot seek directly into a standard B-Tree index.',
      suggestion:
        fnName === 'YEAR' || fnName === 'EXTRACT' || fnName === 'DATE'
          ? 'Use explicit half-open range bounds (e.g. created_at >= \'2026-01-01\' AND created_at < \'2027-01-01\').'
          : `Create a functional/expression index on ${fnName}(column) or store normalized values.`,
    });
    // Auto-rewrite simple YEAR(col) = YYYY pattern
    suggestedSql = suggestedSql.replace(
      /\bYEAR\s*\(\s*([A-Za-z0-9_.]+)\s*\)\s*=\s*(\d{4})\b/gi,
      (_m, col, year) => `${col} >= '${year}-01-01' AND ${col} < '${Number(year) + 1}-01-01'`
    );
  }

  // 7. Leading wildcard LIKE '%...'
  if (/\bI?LIKE\s+'%/i.test(sql)) {
    findings.push({
      id: 'efficiency-leading-wildcard',
      category: 'Efficiency',
      severity: 'Warning',
      title: 'Leading wildcard in LIKE/ILIKE prevents B-Tree index usage',
      clause: "LIKE '%...'",
      whyItMatters:
        'A leading "%" forces scanning every row. On large text columns this scales linearly with table size.',
      suggestion:
        'Use prefix matching ("term%"), Full-Text Search (tsvector / GIN), or a pg_trgm trigram index.',
    });
  }

  // 8. SELECT * usage
  if (/\bSELECT\s+\*/i.test(sql)) {
    findings.push({
      id: 'efficiency-select-star',
      category: 'Efficiency',
      severity: 'Warning',
      title: 'SELECT * fetches unnecessary columns and blocks index-only scans',
      clause: 'SELECT *',
      whyItMatters:
        'Returning every column increases I/O, breaks downstream consumers when schemas evolve, and prevents covering indexes from avoiding heap lookups.',
      suggestion: 'Explicitly project only the required columns (e.g. SELECT id, status, total_cents).',
    });
  }

  // 9. Implicit comma join (FROM a, b)
  if (/\bFROM\s+[A-Za-z_][A-Za-z0-9_]*(?:\s+(?:AS\s+)?[A-Za-z_][A-Za-z0-9_]*)?\s*,\s*[A-Za-z_][A-Za-z0-9_]*/i.test(sql)) {
    findings.push({
      id: 'clarity-comma-join',
      category: 'Clarity',
      severity: 'Warning',
      title: 'Implicit comma-style join in FROM clause',
      clause: 'FROM table_a, table_b',
      whyItMatters:
        'Comma joins hide join predicates inside WHERE and easily produce accidental Cartesian products (N×M row explosion) if a predicate is missed.',
      suggestion: 'Replace comma joins with explicit INNER JOIN ... ON syntax for clarity and safety.',
    });
  }

  // 10. Correlated scalar subquery inside SELECT list
  if (/\bSELECT\b[\s\S]{0,240}\(\s*SELECT\b/i.test(sql)) {
    findings.push({
      id: 'efficiency-select-subquery',
      category: 'Efficiency',
      severity: 'Warning',
      title: 'Scalar subquery inside SELECT projection (potential N+1 execution)',
      clause: 'SELECT (SELECT ...)',
      whyItMatters:
        'Correlated subqueries in the SELECT list often execute once per outer row, degrading latency exponentially on larger tables.',
      suggestion: 'Refactor into a pre-aggregated CTE or LEFT JOIN against a grouped derived table.',
    });
  }

  // 11. ORDER BY without LIMIT
  if (/\bORDER\s+BY\b/i.test(sql) && !/\bLIMIT\b|\bTOP\s+\d+|\bFETCH\s+FIRST\b/i.test(sql)) {
    findings.push({
      id: 'efficiency-unbounded-sort',
      category: 'Efficiency',
      severity: 'Suggestion',
      title: 'Unbounded ORDER BY without LIMIT',
      clause: 'ORDER BY',
      whyItMatters:
        'Sorting an entire result set without pagination can spill temporary sort buffers to disk.',
      suggestion: 'Add a LIMIT / FETCH FIRST clause or keyset pagination when serving UI or API lists.',
    });
    if (!suggestedSql.endsWith(';')) {
      suggestedSql = `${suggestedSql}\nLIMIT 100;`;
    } else {
      suggestedSql = suggestedSql.replace(/;\s*$/, '\nLIMIT 100;');
    }
  }

  // 12. Repeated OR conditions on same column -> suggest IN (...)
  const repeatedOrMatch = sql.match(
    /\b([A-Za-z0-9_.]+)\s*=\s*'[^']*'\s+OR\s+\1\s*=\s*'[^']*'/i
  );
  if (repeatedOrMatch) {
    findings.push({
      id: 'clarity-or-to-in',
      category: 'Clarity',
      severity: 'Suggestion',
      title: `Repeated OR equality checks on "${repeatedOrMatch[1]}"`,
      clause: 'WHERE ... OR ...',
      whyItMatters:
        'Chained OR conditions reduce readability and can obscure intent compared to set membership.',
      suggestion: `Consolidate into "${repeatedOrMatch[1]} IN ('val1', 'val2', ...)" for cleaner, index-friendly predicates.`,
    });
  }

  // Build contextual mismatch hints from user's expected vs actual description
  const mismatchHints: string[] = [];
  const combinedSymptom = `${options?.expectedBehavior ?? ''} ${options?.actualIssue ?? ''}`.toLowerCase();
  if (/0 rows|empty|nothing|missing|zero/.test(combinedSymptom)) {
    mismatchHints.push(
      'Check case-sensitivity on string literals, NULL comparisons (use IS NULL), timezone boundaries on timestamps, and WHERE clauses filtering a LEFT JOIN table.'
    );
  }
  if (/duplicate|inflated|too many|double|multipl/.test(combinedSymptom)) {
    mismatchHints.push(
      'Inflated counts or duplicate rows usually come from a 1:N join fan-out before aggregation. Pre-aggregate child tables in a CTE before joining, or verify join key uniqueness.'
    );
  }
  if (/group by|aggregate|must appear/.test(combinedSymptom)) {
    mismatchHints.push(
      'Every non-aggregated column in SELECT must appear in GROUP BY (or be wrapped in an aggregate function / window function).'
    );
  }
  if (/slow|timeout|latency|scan/.test(combinedSymptom)) {
    mismatchHints.push(
      'Run EXPLAIN (ANALYZE, BUFFERS) to locate Seq Scans, then ensure WHERE/JOIN columns are SARGable and covered by composite indexes matching equality columns first, then range/sort columns.'
    );
  }

  const lineCount = sql.split('\n').length;
  const joinCount = (sql.match(/\bJOIN\b/gi) ?? []).length;
  const subqueryCount = Math.max(0, (sql.match(/\bSELECT\b/gi) ?? []).length - 1);
  const criticalCount = findings.filter((f) => f.severity === 'Critical').length;

  return {
    findings,
    suggestedSql,
    diffLines: computeLineDiff(sql, suggestedSql),
    stats: {
      lineCount,
      joinCount,
      subqueryCount,
      issueCount: findings.length,
      criticalCount,
    },
    mismatchHints,
  };
}

/**
 * Computes a clean line-by-line diff between original SQL and suggested SQL.
 */
export function computeLineDiff(original: string, updated: string): SqlDiffLine[] {
  const a = original.trim().split('\n');
  const b = updated.trim().split('\n');
  const result: SqlDiffLine[] = [];
  const maxLen = Math.max(a.length, b.length);

  for (let i = 0; i < maxLen; i++) {
    const lineA = a[i];
    const lineB = b[i];
    if (lineA === lineB && lineA !== undefined) {
      result.push({ kind: 'same', text: lineA });
    } else {
      if (lineA !== undefined) result.push({ kind: 'removed', text: lineA });
      if (lineB !== undefined) result.push({ kind: 'added', text: lineB });
    }
  }
  return result;
}
