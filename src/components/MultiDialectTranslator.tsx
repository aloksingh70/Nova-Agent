import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCw,
  GitCompare,
} from 'lucide-react';
import type { SqlDialect } from '../types/nova';
import { DIALECT_OPTIONS } from '../utils/sqlFormatter';
import { translateSqlDialect, type DialectTranslationResult } from '../utils/dialectTranslator';
import { SqlCodeBlock } from './SqlCodeBlock';

interface MultiDialectTranslatorProps {
  initialSql?: string;
  initialFrom?: SqlDialect;
  initialTo?: SqlDialect;
  onRunInSandbox?: (sql: string) => void;
}

const DEFAULT_TRANSLATE_SAMPLE = `SELECT o.id, o.customer_email, DATE_TRUNC('month', o.created_at) AS order_month, SUM(o.total_cents) AS total_sales
FROM orders o
WHERE o.status ILIKE 'completed'
  AND o.created_at >= '2026-01-01'
GROUP BY o.id, o.customer_email, order_month
ORDER BY total_sales DESC
LIMIT 10;`;

export const MultiDialectTranslator: React.FC<MultiDialectTranslatorProps> = ({
  initialSql = DEFAULT_TRANSLATE_SAMPLE,
  initialFrom = 'postgresql',
  initialTo = 'mysql',
  onRunInSandbox,
}) => {
  const [sourceSql, setSourceSql] = useState<string>(initialSql);
  const [fromDialect, setFromDialect] = useState<SqlDialect>(initialFrom);
  const [toDialect, setToDialect] = useState<SqlDialect>(initialTo);
  const [copied, setCopied] = useState(false);

  const translation: DialectTranslationResult = useMemo(() => {
    return translateSqlDialect(sourceSql, fromDialect, toDialect);
  }, [sourceSql, fromDialect, toDialect]);

  const handleCopyTranslated = async () => {
    try {
      await navigator.clipboard.writeText(translation.translatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handleSwap = () => {
    const temp = fromDialect;
    setFromDialect(toDialect);
    setToDialect(temp);
    setSourceSql(translation.translatedCode);
  };

  return (
    <div
      data-testid="multi-dialect-translator"
      className="border border-[#141414]/25 bg-[#f6f4ef] overflow-hidden flex flex-col"
    >
      {/* Header Bar */}
      <div className="p-3 border-b border-[#141414]/15 bg-[#efece6] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-[#141414]" />
          <div>
            <h3 className="text-[14px] font-medium text-[#141414] flex items-center gap-2">
              <span>Multi-Dialect Side-by-Side Translator</span>
              <span className="font-mono text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-800 border border-blue-300 rounded">
                Cross-Dialect Engine
              </span>
            </h3>
            <p className="text-[11.5px] text-[#141414]/65">
              Convert queries and DDL between PostgreSQL, MySQL, SQL Server, BigQuery, SQLite, and MongoDB with syntax diffs and caveat warnings.
            </p>
          </div>
        </div>

        {/* Dialect Pickers */}
        <div className="flex items-center gap-2">
          <select
            value={fromDialect}
            onChange={(e) => setFromDialect(e.target.value as SqlDialect)}
            className="h-8 px-2 bg-white border border-[#141414]/25 font-mono text-[11px] focus:outline-none cursor-pointer"
          >
            {DIALECT_OPTIONS.map((d) => (
              <option key={d.id} value={d.id}>
                From: {d.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleSwap}
            className="p-1.5 border border-[#141414]/25 bg-[#efece6] hover:bg-[#141414] hover:text-[#efece6] transition-colors cursor-pointer"
            title="Swap dialects"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <select
            value={toDialect}
            onChange={(e) => setToDialect(e.target.value as SqlDialect)}
            className="h-8 px-2 bg-white border border-[#141414]/25 font-mono text-[11px] focus:outline-none cursor-pointer"
          >
            {DIALECT_OPTIONS.map((d) => (
              <option key={d.id} value={d.id}>
                To: {d.label}
              </option>
            ))}
          </select>

          {onRunInSandbox && (
            <button
              type="button"
              onClick={() => onRunInSandbox(translation.translatedCode)}
              className="px-2.5 py-1.5 bg-[#141414] text-[#efece6] hover:bg-[#2a2928] font-mono-label text-[10px] inline-flex items-center gap-1.5 transition-colors cursor-pointer ml-1"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Test in Sandbox</span>
            </button>
          )}
        </div>
      </div>

      {/* Side-by-side View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#141414]/15">
        {/* Left: Source SQL */}
        <div className="flex flex-col bg-[#19191c]">
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between text-[11px] font-mono text-[#f3f0ea]/70">
            <span>{fromDialect.toUpperCase()} Source</span>
            <span>Input</span>
          </div>
          <textarea
            value={sourceSql}
            onChange={(e) => setSourceSql(e.target.value)}
            rows={12}
            className="w-full flex-1 p-3 bg-transparent text-[#f3f0ea] font-mono text-[12px] leading-[1.6] focus:outline-none resize-none nova-scroll"
            placeholder="Paste source query to translate..."
          />
        </div>

        {/* Right: Translated SQL Output */}
        <div className="flex flex-col bg-[#19191c]">
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between text-[11px] font-mono text-[#f3f0ea]/70">
            <span>{toDialect.toUpperCase()} Translation</span>
            <div className="flex items-center gap-3">
              <span className="text-emerald-400 font-semibold">{translation.compatibilityScore}% Compatible</span>
              <button
                type="button"
                onClick={handleCopyTranslated}
                className="hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
          <pre className="w-full flex-1 p-3 bg-transparent text-emerald-300 font-mono text-[12px] leading-[1.6] overflow-x-auto nova-scroll">
            <code>{translation.translatedCode}</code>
          </pre>
        </div>
      </div>

      {/* Transformations & Caveats Footer */}
      <div className="p-3 border-t border-[#141414]/15 bg-[#efece6] space-y-2 text-[11px] font-mono">
        {translation.transformations.length > 0 && (
          <div className="space-y-1">
            <span className="font-semibold text-[#141414] block">Applied Syntax Transformations:</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {translation.transformations.map((t, idx) => (
                <div key={idx} className="p-2 border border-[#141414]/15 bg-white space-y-1">
                  <div className="flex items-center justify-between gap-1 text-[10.5px]">
                    <span className="text-red-700 line-through truncate">{t.fromSnippet}</span>
                    <ArrowRight className="w-3 h-3 text-[#141414]/50 shrink-0" />
                    <span className="text-emerald-700 font-semibold truncate">{t.toSnippet}</span>
                  </div>
                  <p className="text-[10px] text-[#141414]/65 leading-relaxed">{t.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {translation.caveats.length > 0 && (
          <div className="flex items-center gap-2 text-[#b45309] pt-1">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{translation.caveats[0]}</span>
          </div>
        )}
      </div>
    </div>
  );
};
