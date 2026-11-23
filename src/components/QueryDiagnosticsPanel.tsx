import React, { useMemo, useState } from 'react';
import { AlertCircle, ArrowUpRight, CheckCircle2, Wrench } from 'lucide-react';
import type { NovaMode, SqlDialect } from '../types/nova';
import { analyzeSqlQuery } from '../utils/sqlAnalyzer';

interface QueryDiagnosticsPanelProps {
  dialect: SqlDialect;
  mode: NovaMode;
  loading: boolean;
  onRunDeepAi: (prompt: string, targetMode: NovaMode) => void;
}

const DIAGNOSTIC_PRESETS = [
  {
    label: 'LEFT JOIN + NULL Bug',
    mode: 'debug' as NovaMode,
    sql: `SELECT u.name, SUM(o.amount) AS total_spend
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE o.status != 'cancelled' AND u.deleted_at = NULL
GROUP BY u.name;`,
    expected: 'Return all active users including users with 0 orders',
    actual: 'Returned 0 rows instead of active users',
  },
  {
    label: 'Slow Non-SARGable Query',
    mode: 'optimize' as NovaMode,
    sql: `SELECT *
FROM orders o
WHERE LOWER(o.customer_email) = 'founder@halden.io'
  AND YEAR(o.created_at) = 2026
ORDER BY o.total_cents DESC;`,
    expected: 'Fast lookup under 10ms using B-Tree index',
    actual: 'Sequential scan timing out at 4.2s on 12M rows',
  },
  {
    label: 'GROUP BY / WHERE Error',
    mode: 'debug' as NovaMode,
    sql: `SELECT department_id, employee_name, AVG(salary)
FROM employees
WHERE AVG(salary) > 90000
  AND department_id NOT IN (SELECT id FROM archived_departments)
GROUP BY department_id;`,
    expected: 'Departments with average salary above 90k excluding archived ones',
    actual: 'Database throws aggregate functions are not allowed in WHERE',
  },
];

export const QueryDiagnosticsPanel: React.FC<QueryDiagnosticsPanelProps> = ({
  dialect,
  mode,
  loading,
  onRunDeepAi,
}) => {
  const [sql, setSql] = useState(DIAGNOSTIC_PRESETS[0].sql);
  const [expectedBehavior, setExpectedBehavior] = useState(DIAGNOSTIC_PRESETS[0].expected);
  const [actualIssue, setActualIssue] = useState(DIAGNOSTIC_PRESETS[0].actual);

  const analysis = useMemo(
    () => analyzeSqlQuery(sql, { expectedBehavior, actualIssue }),
    [sql, expectedBehavior, actualIssue]
  );

  const hasAutoRewrite = analysis.suggestedSql.trim() !== sql.trim() && analysis.suggestedSql.trim().length > 0;

  const handleDeepAiSubmit = (targetMode: NovaMode) => {
    if (!sql.trim() || loading) return;
    const summaryFindings = analysis.findings
      .map((f) => `- [${f.category}/${f.severity}] ${f.title}: ${f.suggestion}`)
      .join('\n');

    const prompt = [
      `Target dialect: ${dialect.toUpperCase()}`,
      `SQL Query:\n\`\`\`sql\n${sql.trim()}\n\`\`\``,
      expectedBehavior.trim() ? `Expected result: ${expectedBehavior.trim()}` : '',
      actualIssue.trim() ? `Actual result / error: ${actualIssue.trim()}` : '',
      summaryFindings ? `Static analyzer findings:\n${summaryFindings}` : '',
      targetMode === 'debug'
        ? 'Explain why this query does not return the expected results, fix every bug, and provide the corrected query.'
        : 'Optimize this query for efficiency and clarity, explain bottlenecks, and provide composite index DDL.',
    ]
      .filter(Boolean)
      .join('\n\n');

    onRunDeepAi(prompt, targetMode);
  };

  return (
    <section
      aria-label="Query Optimization and Debugging Workbench"
      data-testid="query-diagnostics-workbench"
      className="border border-[#141414]/25 bg-[#f6f4ef] overflow-hidden"
    >
      {/* Header + Presets */}
      <div className="px-4 py-3 border-b border-[#141414]/15 bg-[#efece6] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-medium text-[#141414] flex items-center gap-2">
            <Wrench className="w-4 h-4 shrink-0" />
            <span>Query Optimization &amp; Debugging Workbench</span>
          </h2>
          <p className="text-[12.5px] text-[#141414]/65">
            Instant clarity, efficiency, and result-mismatch analysis — plus deep Gemini rewrite.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {DIAGNOSTIC_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setSql(preset.sql);
                setExpectedBehavior(preset.expected);
                setActualIssue(preset.actual);
              }}
              className="px-2.5 py-1 border border-[#141414]/20 bg-[#f6f4ef] hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[9.5px] transition-colors whitespace-nowrap cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Editor + Mismatch Inputs */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-4 border-b border-[#141414]/15">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="diag-sql-input"
              className="font-mono-label text-[10px] text-[#141414]/75"
            >
              SQL Query to Inspect ({dialect.toUpperCase()})
            </label>
            <span className="font-mono text-[10px] text-[#141414]/55 tabular-nums">
              {analysis.stats.lineCount} lines · {analysis.stats.joinCount} joins ·{' '}
              {analysis.stats.issueCount} {analysis.stats.issueCount === 1 ? 'finding' : 'findings'}
            </span>
          </div>
          <textarea
            id="diag-sql-input"
            rows={6}
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            placeholder="Paste a SQL query to inspect for clarity, efficiency, or missing/incorrect results..."
            className="w-full p-3 bg-[#19191c] text-[#f3f0ea] border border-[#141414]/30 font-mono text-[12.5px] leading-[1.55] focus:outline-none focus:border-[#ff5a5f] resize-y"
          />
        </div>

        <div className="space-y-3 flex flex-col justify-between">
          <div className="space-y-3">
            <div>
              <label
                htmlFor="diag-expected"
                className="block font-mono-label text-[10px] text-[#141414]/75 mb-1"
              >
                Expected Result (Optional)
              </label>
              <input
                id="diag-expected"
                type="text"
                value={expectedBehavior}
                onChange={(e) => setExpectedBehavior(e.target.value)}
                placeholder="e.g. Include users with zero orders"
                className="w-full h-9 px-3 bg-[#efece6] border border-[#141414]/25 text-[13px] focus:outline-none focus:border-[#141414]"
              />
            </div>

            <div>
              <label
                htmlFor="diag-actual"
                className="block font-mono-label text-[10px] text-[#141414]/75 mb-1"
              >
                Actual Behavior or Database Error (Optional)
              </label>
              <input
                id="diag-actual"
                type="text"
                value={actualIssue}
                onChange={(e) => setActualIssue(e.target.value)}
                placeholder="e.g. Returned 0 rows, duplicate totals, or syntax error"
                className="w-full h-9 px-3 bg-[#efece6] border border-[#141414]/25 text-[13px] focus:outline-none focus:border-[#141414]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={loading || !sql.trim()}
              onClick={() => handleDeepAiSubmit('debug')}
              className="flex-1 h-9 px-3 bg-[#141414] text-[#efece6] hover:bg-[#2a2928] disabled:opacity-40 font-mono-label text-[10px] inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <span>Deep AI Debug</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={loading || !sql.trim()}
              onClick={() => handleDeepAiSubmit('optimize')}
              className="flex-1 h-9 px-3 border border-[#141414] bg-[#efece6] text-[#141414] hover:bg-[#141414] hover:text-[#efece6] disabled:opacity-40 font-mono-label text-[10px] inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <span>Deep AI Optimize</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Live Findings & Mismatch Diagnosis */}
      <div className="p-4 space-y-4">
        {analysis.findings.length === 0 ? (
          <div className="flex items-center gap-2.5 text-[13.5px] text-[#15803d] py-1">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              No static clarity, efficiency, or result-mismatch traps detected. Use Deep AI{' '}
              {mode === 'debug' ? 'Debug' : 'Optimize'} for index and query-plan tuning.
            </span>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="font-mono-label text-[10.5px] text-[#141414]/75">
                Instant Diagnostic Findings ({analysis.findings.length})
              </h3>
              <span className="font-mono-label text-[10px] text-[#141414]/55 tabular-nums">
                {analysis.stats.criticalCount} critical
              </span>
            </div>

            <div className="border-t border-[#141414]/15 divide-y divide-[#141414]/12">
              {analysis.findings.map((finding) => (
                <div
                  key={finding.id}
                  className="py-3 grid grid-cols-1 md:grid-cols-[180px_1fr] gap-2.5"
                >
                  <div>
                    <div
                      className={`font-mono-label text-[10px] font-semibold flex items-center gap-1.5 ${
                        finding.severity === 'Critical'
                          ? 'text-[#dc2626]'
                          : finding.severity === 'Warning'
                            ? 'text-[#b45309]'
                            : 'text-[#141414]/70'
                      }`}
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {finding.severity} · {finding.category}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-[#141414]/65 mt-1">
                      {finding.clause}
                    </div>
                  </div>
                  <div className="space-y-1 text-[13px] leading-[1.5]">
                    <div className="font-medium text-[#141414]">{finding.title}</div>
                    <p className="text-[#141414]/75">
                      <strong className="font-medium text-[#141414]">Why:</strong>{' '}
                      {finding.whyItMatters}
                    </p>
                    <p className="text-[#141414]/90">
                      <strong className="font-medium text-[#141414]">Suggested fix:</strong>{' '}
                      {finding.suggestion}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Symptom-based Result Mismatch Guidance */}
        {analysis.mismatchHints.length > 0 && (
          <div className="border border-[#141414]/15 bg-[#efece6] p-3.5 space-y-1.5">
            <div className="font-mono-label text-[10px] text-[#141414]/75">
              Why Results May Differ From Expectations
            </div>
            <ul className="space-y-1 text-[13px] text-[#141414]/85 list-disc pl-4">
              {analysis.mismatchHints.map((hint, idx) => (
                <li key={idx}>{hint}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Quick Auto-Rewrite Diff */}
        {hasAutoRewrite && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono-label text-[10px] text-[#141414]/75">
                Quick Auto-Fix Preview
              </span>
              <button
                type="button"
                onClick={() => setSql(analysis.suggestedSql)}
                className="px-2.5 py-1 bg-[#141414] text-[#efece6] hover:bg-[#2a2928] font-mono-label text-[9.5px] transition-colors cursor-pointer"
              >
                Apply Suggested Fix to Editor
              </button>
            </div>
            <pre className="nova-scroll overflow-x-auto bg-[#19191c] text-[#f3f0ea] border border-[#141414]/25 p-3 font-mono text-[12px] leading-[1.55]">
              {analysis.diffLines.map((line, idx) => (
                <div
                  key={idx}
                  className={
                    line.kind === 'removed'
                      ? 'bg-[#dc2626]/20 text-[#fca5a5] px-1.5'
                      : line.kind === 'added'
                        ? 'bg-[#16a34a]/20 text-[#86efac] px-1.5'
                        : 'text-[#f3f0ea]/75 px-1.5'
                  }
                >
                  <span className="select-none mr-2 opacity-60">
                    {line.kind === 'removed' ? '-' : line.kind === 'added' ? '+' : ' '}
                  </span>
                  {line.text}
                </div>
              ))}
            </pre>
          </div>
        )}
      </div>
    </section>
  );
};
