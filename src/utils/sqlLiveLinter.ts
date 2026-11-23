import type { SqlDialect } from '../types/nova';
import { parseSqlDdl } from './sqlDdlParser';

export type SqlLintSeverity = 'error' | 'warning' | 'info';

export interface SqlLintQuickFix {
  label: string;
  replacement: string;
}

export interface SqlLintDiagnostic {
  id: string;
  code: string;
  severity: SqlLintSeverity;
  message: string;
  hint: string;
  start: number;
  end: number;
  line: number;
  column: number;
  quickFix?: SqlLintQuickFix;
}

export interface SqlLintResult {
  isSql: boolean;
  diagnostics: SqlLintDiagnostic[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

const SQL_START_RE =
  /^\s*(?:--[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*(?:SELECT|SELCT|SELEC|WITH|INSERT|INSRT|UPDATE|UPDAT|DELETE|DELET|CREATE|CREAT|ALTER|DROP|EXPLAIN|MERGE|TRUNCATE|GRANT|REVOKE|SHOW|DESCRIBE|DESC|db\.[A-Za-z0-9_]+\.)\b/i;

const SQL_CLAUSE_PAIR_RE =
  /\b(?:SELECT|SELCT|SELEC)\b[\s\S]+\b(?:FROM|FORM|WHERE|WHER|JOIN|GROUP\s+BY|ORDER\s+BY)\b|\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|VIEW)\b|\b(?:DELETE\s+FROM|UPDATE\s+[A-Za-z_][A-Za-z0-9_.]*\s+SET|INSERT\s+INTO)\b/i;

/**
 * Determines whether the composer text contains a SQL or MongoDB query/DDL statement
 * (as opposed to plain English natural-language prompts).
 */
export function looksLikeSqlOrNoSql(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 4) return false;
  return SQL_START_RE.test(trimmed) || SQL_CLAUSE_PAIR_RE.test(trimmed);
}

/**
 * Maps a 0-based character index to 1-based line & column numbers.
 */
export function indexToLineCol(text: string, index: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(index, text.length));
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < clamped; i++) {
    if (text[i] === '\n') {
      line++;
      lastNewline = i;
    }
  }
  return { line, column: clamped - lastNewline };
}

/**
 * Masks string literals and SQL comments with spaces of identical length so regex-based
 * syntax/anti-pattern checks never false-positive inside quotes or comments while
 * preserving exact character offsets.
 */
function maskStringsAndComments(sql: string): {
  masked: string;
  unclosedQuote?: { quote: "'" | '"'; index: number };
} {
  const chars = sql.split('');
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let quoteStart = -1;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inSingle) {
      if (ch === "'" && next === "'") {
        chars[i] = ' ';
        chars[i + 1] = ' ';
        i += 2;
        continue;
      }
      if (ch === "'") {
        inSingle = false;
        chars[i] = ' ';
        i++;
        continue;
      }
      if (ch !== '\n') chars[i] = ' ';
      i++;
      continue;
    }

    if (inDouble) {
      if (ch === '"' && next === '"') {
        chars[i] = ' ';
        chars[i + 1] = ' ';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inDouble = false;
        chars[i] = ' ';
        i++;
        continue;
      }
      if (ch !== '\n') chars[i] = ' ';
      i++;
      continue;
    }

    if (ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        chars[i] = ' ';
        i++;
      }
      continue;
    }

    if (ch === '/' && next === '*') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) {
        if (sql[i] !== '\n') chars[i] = ' ';
        i++;
      }
      if (i < sql.length) {
        chars[i] = ' ';
        if (i + 1 < sql.length) chars[i + 1] = ' ';
        i += 2;
      }
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      quoteStart = i;
      chars[i] = ' ';
      i++;
      continue;
    }

    if (ch === '"') {
      inDouble = true;
      quoteStart = i;
      chars[i] = ' ';
      i++;
      continue;
    }

    i++;
  }

  if (inSingle || inDouble) {
    return {
      masked: chars.join(''),
      unclosedQuote: { quote: inSingle ? "'" : '"', index: quoteStart },
    };
  }

  return { masked: chars.join('') };
}

const KEYWORD_TYPOS: { re: RegExp; fix: string; label: string }[] = [
  { re: /\bSELCT\b/gi, fix: 'SELECT', label: 'Fix typo → SELECT' },
  { re: /\bSELEC\b/gi, fix: 'SELECT', label: 'Fix typo → SELECT' },
  { re: /\bFORM\b(?=\s+[A-Za-z_"`[])/gi, fix: 'FROM', label: 'Fix typo → FROM' },
  { re: /\bWHER\b/gi, fix: 'WHERE', label: 'Fix typo → WHERE' },
  { re: /\bGROP\s+BY\b/gi, fix: 'GROUP BY', label: 'Fix typo → GROUP BY' },
  { re: /\bORDR\s+BY\b/gi, fix: 'ORDER BY', label: 'Fix typo → ORDER BY' },
  { re: /\bINSRT\b/gi, fix: 'INSERT', label: 'Fix typo → INSERT' },
  { re: /\bUPDAT\b/gi, fix: 'UPDATE', label: 'Fix typo → UPDATE' },
  { re: /\bDELET\b/gi, fix: 'DELETE', label: 'Fix typo → DELETE' },
  { re: /\bCREAT\s+TABLE\b/gi, fix: 'CREATE TABLE', label: 'Fix typo → CREATE TABLE' },
];

/**
 * Performs real-time SQL linting with exact character spans for inline squiggle highlights
 * and one-click Quick Fixes.
 */
export function lintSqlLive(
  text: string,
  dialect: SqlDialect = 'postgresql',
  schemaContext?: string
): SqlLintResult {
  const isSql = looksLikeSqlOrNoSql(text);
  if (!isSql) {
    return {
      isSql: false,
      diagnostics: [],
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
    };
  }

  const diagnostics: SqlLintDiagnostic[] = [];
  const pushDiag = (
    item: Omit<SqlLintDiagnostic, 'id' | 'line' | 'column'>
  ) => {
    const start = Math.max(0, Math.min(item.start, text.length));
    const end = Math.max(start + 1, Math.min(item.end, text.length));
    const pos = indexToLineCol(text, start);
    diagnostics.push({
      ...item,
      id: `${item.code}-${start}-${end}`,
      start,
      end,
      line: pos.line,
      column: pos.column,
    });
  };

  const { masked, unclosedQuote } = maskStringsAndComments(text);

  // 1. Unclosed string/identifier quote
  if (unclosedQuote) {
    pushDiag({
      code: 'SQL001',
      severity: 'error',
      message: `Unclosed ${unclosedQuote.quote === "'" ? 'single' : 'double'} quote literal`,
      hint: `Add a matching closing ${unclosedQuote.quote} before executing this query.`,
      start: unclosedQuote.index,
      end: Math.min(text.length, unclosedQuote.index + 8),
    });
  }

  // 2. Unbalanced parentheses (exact unmatched position)
  const parenStack: number[] = [];
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === '(') {
      parenStack.push(i);
    } else if (masked[i] === ')') {
      if (parenStack.length === 0) {
        pushDiag({
          code: 'SQL002',
          severity: 'error',
          message: 'Unexpected closing parenthesis ")"',
          hint: 'Remove this extra ")" or add a matching opening "(" earlier.',
          start: i,
          end: i + 1,
        });
      } else {
        parenStack.pop();
      }
    }
  }
  for (const openIdx of parenStack) {
    pushDiag({
      code: 'SQL002',
      severity: 'error',
      message: 'Unclosed opening parenthesis "("',
      hint: 'Add a matching ")" to close this expression or subquery.',
      start: openIdx,
      end: openIdx + 1,
    });
  }

  // 3. Common SQL keyword typos with Quick Fixes
  for (const typo of KEYWORD_TYPOS) {
    typo.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = typo.re.exec(masked)) !== null) {
      pushDiag({
        code: 'SQL003',
        severity: 'error',
        message: `Possible SQL keyword typo "${text.slice(m.index, m.index + m[0].length)}"`,
        hint: `Did you mean "${typo.fix}"?`,
        start: m.index,
        end: m.index + m[0].length,
        quickFix: { label: typo.label, replacement: typo.fix },
      });
    }
  }

  // 4. Trailing comma before FROM / WHERE / GROUP BY / ORDER BY / )
  const trailingCommaRe = /,(\s*)(?=(?:FROM|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|\)))/gi;
  let m: RegExpExecArray | null;
  while ((m = trailingCommaRe.exec(masked)) !== null) {
    pushDiag({
      code: 'SQL004',
      severity: 'error',
      message: 'Trailing comma before next SQL clause',
      hint: 'Remove the stray comma — most SQL dialects reject trailing commas before FROM or ")".',
      start: m.index,
      end: m.index + 1,
      quickFix: { label: 'Remove comma', replacement: '' },
    });
  }

  // 5. Direct NULL comparison (= NULL, != NULL, <> NULL)
  const nullEqRe = /(!=|<>|=)\s*NULL\b/gi;
  while ((m = nullEqRe.exec(masked)) !== null) {
    const isNot = m[1] === '!=' || m[1] === '<>';
    const replacement = isNot ? 'IS NOT NULL' : 'IS NULL';
    pushDiag({
      code: 'SQL005',
      severity: 'error',
      message: `Invalid NULL comparison "${text.slice(m.index, m.index + m[0].length)}"`,
      hint: `SQL three-valued logic evaluates "${m[1]} NULL" as UNKNOWN (returning 0 rows). Use "${replacement}".`,
      start: m.index,
      end: m.index + m[0].length,
      quickFix: { label: `Replace with ${replacement}`, replacement },
    });
  }

  // 6. Aggregate function inside WHERE clause
  const whereIdx = masked.search(/\bWHERE\b/i);
  if (whereIdx !== -1) {
    const afterWhere = masked.slice(whereIdx);
    const clauseEnd = afterWhere.search(/\b(?:GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|UNION)\b/i);
    const whereSegment = clauseEnd === -1 ? afterWhere : afterWhere.slice(0, clauseEnd);
    const aggRe = /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/gi;
    while ((m = aggRe.exec(whereSegment)) !== null) {
      pushDiag({
        code: 'SQL006',
        severity: 'error',
        message: `Aggregate ${m[1].toUpperCase()}() cannot be used inside WHERE`,
        hint: 'Filter row values in WHERE and move aggregate predicates into HAVING after GROUP BY.',
        start: whereIdx + m.index,
        end: whereIdx + m.index + m[0].length,
      });
    }
  }

  // 7. Destructive DELETE or UPDATE without WHERE clause
  const unsafeMutationRe = /\b(DELETE\s+FROM|UPDATE)\s+([A-Za-z_][A-Za-z0-9_."`[\]]*)/gi;
  while ((m = unsafeMutationRe.exec(masked)) !== null) {
    const tail = masked.slice(m.index).split(';')[0] ?? '';
    if (!/\bWHERE\b/i.test(tail)) {
      pushDiag({
        code: 'SQL007',
        severity: 'error',
        message: `${m[1].toUpperCase().startsWith('DELETE') ? 'DELETE' : 'UPDATE'} statement missing WHERE clause`,
        hint: 'Without a WHERE predicate, every row in the table will be modified or deleted.',
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }

  // 7b. JOIN missing ON / USING clause (excludes CROSS JOIN / NATURAL JOIN)
  const joinRe = /\b(?:(CROSS|NATURAL)\s+)?(?:(INNER|LEFT|RIGHT|FULL)\s+(?:OUTER\s+)?)?JOIN\s+([A-Za-z_][A-Za-z0-9_."`[\]]*)/gi;
  while ((m = joinRe.exec(masked)) !== null) {
    const isCrossOrNatural = Boolean(m[1]);
    if (isCrossOrNatural) continue;
    const afterJoin = masked.slice(m.index + m[0].length);
    const nextClauseIdx = afterJoin.search(/\b(?:JOIN|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|UNION|;)\b/i);
    const joinSegment = nextClauseIdx === -1 ? afterJoin : afterJoin.slice(0, nextClauseIdx);
    if (!/\b(?:ON|USING)\b/i.test(joinSegment)) {
      pushDiag({
        code: 'SQL008',
        severity: 'error',
        message: `JOIN "${m[3]}" is missing an ON or USING condition`,
        hint: 'Add an ON condition (e.g. ON a.id = b.a_id) or use CROSS JOIN if a Cartesian product is intentional.',
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }

  // 7c. Duplicate consecutive SQL keywords (e.g. "SELECT SELECT", "AND AND", "FROM FROM")
  const dupKeywordRe = /\b(SELECT|FROM|WHERE|AND|OR|JOIN|ORDER|GROUP|HAVING|LIMIT|SET|VALUES|INTO)\s+\1\b/gi;
  while ((m = dupKeywordRe.exec(masked)) !== null) {
    const firstWord = text.slice(m.index, m.index + m[1].length);
    pushDiag({
      code: 'SQL009',
      severity: 'error',
      message: `Duplicate keyword "${m[1].toUpperCase()} ${m[1].toUpperCase()}"`,
      hint: `Remove the repeated "${m[1].toUpperCase()}" keyword.`,
      start: m.index,
      end: m.index + m[0].length,
      quickFix: { label: `Keep single ${m[1].toUpperCase()}`, replacement: firstWord },
    });
  }

  // 8. SELECT * anti-pattern
  const selectStarRe = /\b(?:SELECT|SELCT|SELEC)\s+(?:DISTINCT\s+)?(\*)/gi;
  while ((m = selectStarRe.exec(masked)) !== null) {
    const starOffset = m.index + m[0].lastIndexOf('*');
    pushDiag({
      code: 'SQL101',
      severity: 'warning',
      message: 'Avoid SELECT * in production queries',
      hint: 'List explicit columns to reduce I/O, avoid schema-drift bugs, and allow covering index scans.',
      start: m.index,
      end: starOffset + 1,
    });
  }

  // 9. NOT IN (SELECT ...) NULL trap
  const notInSubqueryRe = /\bNOT\s+IN\s*\(\s*SELECT\b/gi;
  while ((m = notInSubqueryRe.exec(masked)) !== null) {
    pushDiag({
      code: 'SQL102',
      severity: 'warning',
      message: 'NOT IN (SELECT ...) silently drops all rows if subquery contains NULL',
      hint: 'Prefer NOT EXISTS (...) or add "WHERE col IS NOT NULL" inside the subquery.',
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  // 10. Non-SARGable function in WHERE (YEAR, MONTH, DATE, EXTRACT, LOWER, UPPER, SUBSTRING)
  if (whereIdx !== -1) {
    const afterWhere = masked.slice(whereIdx);
    const clauseEnd = afterWhere.search(/\b(?:GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|UNION)\b/i);
    const whereSegment = clauseEnd === -1 ? afterWhere : afterWhere.slice(0, clauseEnd);

    const yearEqRe = /\bYEAR\s*\(\s*([A-Za-z0-9_.]+)\s*\)\s*=\s*(\d{4})\b/gi;
    const yearHandledOffsets = new Set<number>();
    while ((m = yearEqRe.exec(whereSegment)) !== null) {
      const absStart = whereIdx + m.index;
      yearHandledOffsets.add(absStart);
      const col = text.slice(whereIdx + m.index, whereIdx + m.index + m[0].length).match(/\(\s*([A-Za-z0-9_.]+)\s*\)/)?.[1] ?? m[1];
      const yr = Number(m[2]);
      pushDiag({
        code: 'SQL103',
        severity: 'warning',
        message: `Non-SARGable YEAR(${col}) prevents index seek`,
        hint: `Use a half-open date range: ${col} >= '${yr}-01-01' AND ${col} < '${yr + 1}-01-01'.`,
        start: absStart,
        end: absStart + m[0].length,
        quickFix: {
          label: 'Rewrite as SARGable range',
          replacement: `${col} >= '${yr}-01-01' AND ${col} < '${yr + 1}-01-01'`,
        },
      });
    }

    const nonSargRe = /\b(YEAR|MONTH|DATE|EXTRACT|LOWER|UPPER|SUBSTRING)\s*\([^)]+\)/gi;
    while ((m = nonSargRe.exec(whereSegment)) !== null) {
      const absStart = whereIdx + m.index;
      if (yearHandledOffsets.has(absStart)) continue;
      pushDiag({
        code: 'SQL103',
        severity: 'warning',
        message: `Non-SARGable ${m[1].toUpperCase()}() in WHERE predicate`,
        hint: 'Wrapping an indexed column in a function forces a full scan; use a range predicate or functional index.',
        start: absStart,
        end: absStart + m[0].length,
      });
    }
  }

  // 11. Leading wildcard LIKE '%...'
  const leadingLikeRe = /\b(?:I?LIKE)\s+'%/gi;
  while ((m = leadingLikeRe.exec(text)) !== null) {
    pushDiag({
      code: 'SQL104',
      severity: 'warning',
      message: 'Leading wildcard LIKE pattern disables B-Tree index lookup',
      hint: 'Use a prefix pattern ("abc%"), full-text search, or a trigram (GIN/pg_trgm) index.',
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  // 12. LEFT JOIN right-table filtered in WHERE (turns into INNER JOIN)
  const leftJoinRe = /\bLEFT\s+(?:OUTER\s+)?JOIN\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*))?\s+ON\b/i;
  const ljMatch = leftJoinRe.exec(masked);
  if (ljMatch && whereIdx !== -1) {
    const rightAlias = ljMatch[2] || ljMatch[1];
    const whereSlice = masked.slice(whereIdx);
    const filterRe = new RegExp(
      `\\b${rightAlias}\\.[A-Za-z_][A-Za-z0-9_]*\\s*(?:=|!=|<>|>|<|>=|<=|LIKE|ILIKE|IN\\b)`,
      'i'
    );
    const isNullCheck = new RegExp(`\\b${rightAlias}\\.[A-Za-z_][A-Za-z0-9_]*\\s+IS\\s+NULL\\b`, 'i');
    const filterMatch = filterRe.exec(whereSlice);
    if (filterMatch && !isNullCheck.test(whereSlice)) {
      pushDiag({
        code: 'SQL105',
        severity: 'warning',
        message: `Filtering "${rightAlias}" in WHERE turns LEFT JOIN into INNER JOIN`,
        hint: `Move the "${rightAlias}.*" predicate into the LEFT JOIN ... ON clause to keep unmatched rows.`,
        start: whereIdx + filterMatch.index,
        end: whereIdx + filterMatch.index + filterMatch[0].length,
      });
    }
  }

  // 13. ORDER BY without LIMIT / TOP / FETCH
  const orderByMatch = /\bORDER\s+BY\b/i.exec(masked);
  if (orderByMatch && !/\b(?:LIMIT|FETCH\s+FIRST|TOP\s+\d+)\b/i.test(masked)) {
    pushDiag({
      code: 'SQL201',
      severity: 'info',
      message: 'ORDER BY without LIMIT sorts the entire result set',
      hint: 'Add a LIMIT clause if you only need top-N rows to avoid expensive full sorts.',
      start: orderByMatch.index,
      end: orderByMatch.index + orderByMatch[0].length,
    });
  }

  // 14. Dialect-specific syntax hints
  if (dialect !== 'sqlserver') {
    const topMatch = /\bSELECT\s+(TOP\s+\d+)\b/i.exec(masked);
    if (topMatch) {
      const topStart = topMatch.index + topMatch[0].toUpperCase().indexOf('TOP');
      pushDiag({
        code: 'SQL202',
        severity: 'warning',
        message: `SELECT TOP is SQL Server syntax (active dialect: ${dialect.toUpperCase()})`,
        hint: 'Use a trailing "LIMIT N" clause instead of "TOP N" for this dialect.',
        start: topStart,
        end: topStart + topMatch[1].length,
      });
    }
  }

  if (dialect === 'mysql' || dialect === 'sqlite') {
    const ilikeRe = /\bILIKE\b/gi;
    while ((m = ilikeRe.exec(masked)) !== null) {
      pushDiag({
        code: 'SQL203',
        severity: 'error',
        message: `ILIKE is PostgreSQL-specific and unsupported in ${dialect.toUpperCase()}`,
        hint: 'Replace ILIKE with LIKE (or LOWER(col) LIKE LOWER(...)).',
        start: m.index,
        end: m.index + m[0].length,
        quickFix: { label: 'Replace with LIKE', replacement: 'LIKE' },
      });
    }
  }

  // 15. Schema-Aware Linting (SQL010): check table.column existence in active schema
  if (schemaContext?.trim()) {
    try {
      const parsed = parseSqlDdl(schemaContext);
      const tableMap: Record<string, Set<string>> = {};
      for (const ent of parsed.diagram.entities) {
        tableMap[ent.name.toLowerCase()] = new Set(ent.columns.map((c) => c.name.toLowerCase()));
      }

      const colRefRe = /\b([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\b/g;
      while ((m = colRefRe.exec(masked)) !== null) {
        const tbl = m[1].toLowerCase();
        const col = m[2].toLowerCase();

        if (tableMap[tbl] && !tableMap[tbl].has(col)) {
          pushDiag({
            code: 'SQL010',
            severity: 'warning',
            message: `Column "${m[1]}.${m[2]}" not found in active schema table "${m[1]}"`,
            hint: `Available columns on "${m[1]}": ${Array.from(tableMap[tbl]).join(', ')}`,
            start: m.index,
            end: m.index + m[0].length,
          });
        }
      }
    } catch {}
  }

  diagnostics.sort((a, b) => a.start - b.start || (a.severity === 'error' ? -1 : 1));

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;
  const infoCount = diagnostics.filter((d) => d.severity === 'info').length;

  return {
    isSql: true,
    diagnostics,
    errorCount,
    warningCount,
    infoCount,
  };
}

/**
 * Applies a diagnostic's quickFix replacement at its exact [start, end] span.
 */
export function applyLintQuickFix(text: string, diagnostic: SqlLintDiagnostic): string {
  if (!diagnostic.quickFix) return text;
  return `${text.slice(0, diagnostic.start)}${diagnostic.quickFix.replacement}${text.slice(diagnostic.end)}`;
}

/**
 * Applies all non-overlapping quick fixes in reverse offset order so earlier spans remain valid.
 */
export function applyAllLintQuickFixes(
  text: string,
  diagnostics: SqlLintDiagnostic[]
): { text: string; appliedCount: number } {
  const fixable = diagnostics
    .filter((d) => Boolean(d.quickFix))
    .slice()
    .sort((a, b) => b.start - a.start || b.end - a.end);

  let next = text;
  let lastStart = Infinity;
  let appliedCount = 0;

  for (const diag of fixable) {
    if (!diag.quickFix) continue;
    // Skip overlapping spans so we never corrupt adjacent edits
    if (diag.end > lastStart) continue;
    next = `${next.slice(0, diag.start)}${diag.quickFix.replacement}${next.slice(diag.end)}`;
    lastStart = diag.start;
    appliedCount++;
  }

  return { text: next, appliedCount };
}
