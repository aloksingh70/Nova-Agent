import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, Play, Sparkles } from 'lucide-react';
import { downloadTextFile, sanitizeFilename } from '../utils/exportStudio';
import {
  getPrismTokenClass,
  highlightCodeWithPrism,
  resolvePrismLanguage,
} from '../utils/prismHighlight';
import { analyzeSqlMetrics } from '../utils/sqlFormatter';

interface SqlCodeBlockProps {
  code: string;
  label?: string;
  language?: string;
  compact?: boolean;
  onRunInSandbox?: (code: string) => void;
  onExplainQuery?: (code: string) => void;
}

export const SqlCodeBlock: React.FC<SqlCodeBlockProps> = ({
  code,
  label = 'SQL Output',
  language = 'sql',
  compact = false,
  onRunInSandbox,
  onExplainQuery,
}) => {
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const prismLang = useMemo(() => resolvePrismLanguage(language), [language]);
  const segments = useMemo(() => highlightCodeWithPrism(code, language), [code, language]);
  const metrics = useMemo(() => analyzeSqlMetrics(code), [code]);

  const fileExt =
    prismLang === 'mermaid'
      ? 'mmd'
      : prismLang === 'json'
        ? 'json'
        : prismLang === 'mongodb' || prismLang === 'javascript'
          ? 'js'
          : prismLang === 'graphql'
            ? 'graphql'
            : prismLang === 'cypher'
              ? 'cql'
              : 'sql';

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard fallback
    }
  };

  const handleDownload = () => {
    const mime =
      fileExt === 'json'
        ? 'application/json;charset=utf-8'
        : fileExt === 'sql'
          ? 'application/sql;charset=utf-8'
          : fileExt === 'js'
            ? 'application/javascript;charset=utf-8'
            : 'text/plain;charset=utf-8';
    downloadTextFile(`${code.trim()}\n`, sanitizeFilename(label || 'nova-query', fileExt), mime);
    setDownloaded(true);
    window.setTimeout(() => setDownloaded(false), 1800);
  };

  return (
    <div
      data-testid="prism-code-block"
      data-prism-language={prismLang}
      className="border border-[#141414]/20 bg-[#19191c] text-[#f3f0ea] overflow-hidden"
    >
      <div className="flex items-center justify-between gap-4 px-3.5 py-2 border-b border-white/10 bg-[#141416]">
        <div className="flex items-center gap-2.5 font-mono-label text-[10px] text-[#f3f0ea]/70 truncate">
          <span className="text-[#f3f0ea] font-medium">{label}</span>
          <span aria-hidden="true">·</span>
          <span>{language}</span>
          {!compact && metrics.lineCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{metrics.lineCount} lines</span>
              {prismLang === 'sql' && metrics.joinCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    {metrics.joinCount} {metrics.joinCount === 1 ? 'join' : 'joins'}
                  </span>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {onRunInSandbox && (
            <button
              type="button"
              onClick={() => onRunInSandbox(code)}
              aria-label="Run in Live SQL Sandbox"
              className="inline-flex items-center gap-1 px-2 py-0.5 border border-white/20 bg-white/5 hover:bg-white hover:text-[#141414] font-mono-label text-[10px] text-[#f3f0ea] transition-colors shrink-0 cursor-pointer"
              title="Execute in In-Browser Live SQL Sandbox"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Run Sandbox</span>
            </button>
          )}

          {onExplainQuery && (
            <button
              type="button"
              onClick={() => onExplainQuery(code)}
              aria-label="Explain Query Execution Plan"
              className="inline-flex items-center gap-1 px-2 py-0.5 border border-white/20 bg-white/5 hover:bg-white hover:text-[#141414] font-mono-label text-[10px] text-[#f3f0ea] transition-colors shrink-0 cursor-pointer"
              title="Analyze Execution Plan & Bottlenecks"
            >
              <Sparkles className="w-3 h-3 text-[#ff5a5f]" />
              <span>Explain Plan</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleDownload}
            aria-label={`Download ${label} as .${fileExt}`}
            className="inline-flex items-center gap-1 font-mono-label text-[10px] text-[#f3f0ea]/75 hover:text-[#ffb347] transition-colors shrink-0 cursor-pointer"
          >
            {downloaded ? (
              <Check className="w-3.5 h-3.5 text-[#ffb347]" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>{downloaded ? `Saved .${fileExt}` : `.${fileExt}`}</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            data-testid="sql-copy-btn"
            aria-label="Copy to Clipboard"
            className="inline-flex items-center gap-1 px-2 py-0.5 border border-white/20 bg-white/10 hover:bg-white hover:text-[#141414] font-mono-label text-[10px] text-[#f3f0ea] transition-colors shrink-0 cursor-pointer"
            title="Copy SQL to Clipboard"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span className="font-medium">{copied ? 'Copied to Clipboard!' : 'Copy to Clipboard'}</span>
          </button>
        </div>
      </div>

      <pre
        className={`nova-scroll overflow-x-auto font-mono text-[12.5px] leading-[1.6] language-${prismLang} ${
          compact ? 'p-3' : 'p-4'
        }`}
      >
        <code className={`language-${prismLang}`}>
          {segments.map((seg, i) => (
            <span
              key={i}
              data-token-type={seg.type}
              className={getPrismTokenClass(seg.type)}
            >
              {seg.content}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
};
