import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Code2,
  Database,
  Info,
  Sparkles,
  Table as TableIcon,
  Wand2,
  Wrench,
} from 'lucide-react';
import type { SqlDialect } from '../types/nova';
import { parseSqlDdl } from '../utils/sqlDdlParser';
import { getPrismTokenClass, highlightCodeWithPrism, resolvePrismLanguage } from '../utils/prismHighlight';
import {
  applyAllLintQuickFixes,
  applyLintQuickFix,
  indexToLineCol,
  lintSqlLive,
  type SqlLintDiagnostic,
  type SqlLintSeverity,
} from '../utils/sqlLiveLinter';

interface SqlLintEditorProps {
  id: string;
  value: string;
  dialect: SqlDialect;
  schemaContext?: string;
  placeholder: string;
  forceSqlMode?: boolean;
  onToggleForceSqlMode?: () => void;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

interface HighlightSlice {
  text: string;
  tokenType: string;
  severity: SqlLintSeverity | null;
}

const SEVERITY_PRIORITY: Record<SqlLintSeverity, number> = {
  error: 3,
  warning: 2,
  info: 1,
};

/**
 * Combines Prism syntax tokens with character-offset lint diagnostics into flat React spans
 * so every offending character renders BOTH syntax coloring and a wavy diagnostic underline.
 */
function buildAnnotatedSlices(
  code: string,
  dialect: SqlDialect,
  diagnostics: SqlLintDiagnostic[]
): HighlightSlice[] {
  if (!code) return [];
  const prismLang = resolvePrismLanguage(dialect === 'mongodb' ? 'mongodb' : 'sql');
  const tokens = highlightCodeWithPrism(code, prismLang);

  const charSeverity: (SqlLintSeverity | null)[] = new Array(code.length).fill(null);
  for (const d of diagnostics) {
    const start = Math.max(0, Math.min(d.start, code.length));
    const end = Math.max(start, Math.min(d.end, code.length));
    for (let i = start; i < end; i++) {
      const prev = charSeverity[i];
      if (!prev || SEVERITY_PRIORITY[d.severity] > SEVERITY_PRIORITY[prev]) {
        charSeverity[i] = d.severity;
      }
    }
  }

  const slices: HighlightSlice[] = [];
  let cursor = 0;
  for (const tok of tokens) {
    const content = tok.content;
    if (!content) continue;

    let segStart = 0;
    let currentSev = charSeverity[cursor] ?? null;

    for (let i = 1; i <= content.length; i++) {
      const nextSev = i < content.length ? (charSeverity[cursor + i] ?? null) : undefined;
      if (i === content.length || nextSev !== currentSev) {
        slices.push({
          text: content.slice(segStart, i),
          tokenType: tok.type,
          severity: currentSev,
        });
        segStart = i;
        currentSev = nextSev ?? null;
      }
    }
    cursor += content.length;
  }

  return slices;
}

function getSquiggleClass(severity: SqlLintSeverity | null): string {
  if (severity === 'error') {
    return 'underline decoration-wavy decoration-[#f87171] underline-offset-[3px] bg-[#ef4444]/18';
  }
  if (severity === 'warning') {
    return 'underline decoration-wavy decoration-[#fbbf24] underline-offset-[3px] bg-[#f59e0b]/15';
  }
  if (severity === 'info') {
    return 'underline decoration-dotted decoration-[#38bdf8] underline-offset-[3px]';
  }
  return '';
}

export const SqlLintEditor: React.FC<SqlLintEditorProps> = ({
  id,
  value,
  dialect,
  schemaContext = '',
  placeholder,
  forceSqlMode = false,
  onToggleForceSqlMode,
  onChange,
  onKeyDown,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const [panelExpanded, setPanelExpanded] = useState(true);
  const [cursorIndex, setCursorIndex] = useState(0);

  const lint = useMemo(() => lintSqlLive(value, dialect, schemaContext), [value, dialect, schemaContext]);
  const isSqlMode = forceSqlMode || lint.isSql;

  // Schema-aware tables & columns
  const schemaEntities = useMemo(() => {
    if (!schemaContext?.trim()) return [];
    try {
      const parsed = parseSqlDdl(schemaContext);
      return parsed.diagram.entities || [];
    } catch {
      return [];
    }
  }, [schemaContext]);

  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [dismissedAutocomplete, setDismissedAutocomplete] = useState(false);

  const autocompleteMatch = useMemo(() => {
    if (!schemaEntities.length || !isSqlMode || dismissedAutocomplete) return null;
    const textBefore = value.slice(0, cursorIndex);

    // 1. Column autocomplete after table dot: e.g. "orders." or "orders.c"
    const dotMatch = textBefore.match(/\b([A-Za-z0-9_]+)\.([A-Za-z0-9_]*)$/);
    if (dotMatch) {
      const targetTable = dotMatch[1].toLowerCase();
      const prefix = dotMatch[2].toLowerCase();
      const entity = schemaEntities.find((e) => e.name.toLowerCase() === targetTable);
      if (entity) {
        const items = entity.columns
          .filter((c) => !prefix || c.name.toLowerCase().startsWith(prefix))
          .map((c) => ({
            label: c.name,
            detail: c.type + (c.isPrimaryKey ? ' (PK)' : c.isForeignKey ? ' (FK)' : ''),
            kind: 'column' as const,
            replaceStart: cursorIndex - prefix.length,
            replaceEnd: cursorIndex,
            insertText: c.name,
          }));
        if (items.length > 0) return { items, title: `Columns in "${entity.name}"` };
      }
    }

    // 2. Table autocomplete after FROM or JOIN: e.g. "FROM " or "JOIN cust"
    const fromMatch = textBefore.match(/\b(?:FROM|JOIN)\s+([A-Za-z0-9_]*)$/i);
    if (fromMatch) {
      const prefix = fromMatch[1].toLowerCase();
      const items = schemaEntities
        .filter((e) => !prefix || e.name.toLowerCase().startsWith(prefix))
        .map((e) => ({
          label: e.name,
          detail: `${e.columns.length} columns`,
          kind: 'table' as const,
          replaceStart: cursorIndex - prefix.length,
          replaceEnd: cursorIndex,
          insertText: e.name,
        }));
      if (items.length > 0) return { items, title: 'Tables in Schema' };
    }

    return null;
  }, [value, cursorIndex, schemaEntities, isSqlMode, dismissedAutocomplete]);

  useEffect(() => {
    setAutocompleteIndex(0);
  }, [autocompleteMatch?.items]);

  const handleApplySuggestion = (suggestion: {
    insertText: string;
    replaceStart: number;
    replaceEnd: number;
  }) => {
    const nextVal =
      value.slice(0, suggestion.replaceStart) +
      suggestion.insertText +
      value.slice(suggestion.replaceEnd);
    onChange(nextVal);
    const newCursor = suggestion.replaceStart + suggestion.insertText.length;
    setCursorIndex(newCursor);
    setDismissedAutocomplete(false);
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(newCursor, newCursor);
    }, 10);
  };

  const slices = useMemo(
    () => (isSqlMode ? buildAnnotatedSlices(value, dialect, lint.diagnostics) : []),
    [isSqlMode, value, dialect, lint.diagnostics]
  );

  const lineSeverityMap = useMemo(() => {
    const map = new Map<number, SqlLintSeverity>();
    for (const d of lint.diagnostics) {
      const prev = map.get(d.line);
      if (!prev || SEVERITY_PRIORITY[d.severity] > SEVERITY_PRIORITY[prev]) {
        map.set(d.line, d.severity);
      }
    }
    return map;
  }, [lint.diagnostics]);

  const cursorPos = useMemo(() => indexToLineCol(value, cursorIndex), [value, cursorIndex]);
  const activeCursorDiag = useMemo(
    () =>
      lint.diagnostics.find(
        (d) => cursorIndex >= d.start && cursorIndex <= d.end
      ) ?? null,
    [lint.diagnostics, cursorIndex]
  );

  const quickFixableCount = useMemo(
    () => lint.diagnostics.filter((d) => Boolean(d.quickFix)).length,
    [lint.diagnostics]
  );

  const lineCount = useMemo(() => Math.max(2, value.split('\n').length), [value]);
  const editorRows = Math.min(7, Math.max(2, lineCount));

  const syncCursor = (el: HTMLTextAreaElement) => {
    setCursorIndex(el.selectionStart ?? 0);
  };

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (backdropRef.current) {
      backdropRef.current.scrollTop = scrollTop;
      backdropRef.current.scrollLeft = scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = scrollTop;
    }
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Autocomplete navigation
    if (autocompleteMatch && autocompleteMatch.items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAutocompleteIndex((i) => (i + 1) % autocompleteMatch.items.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAutocompleteIndex((i) => (i - 1 + autocompleteMatch.items.length) % autocompleteMatch.items.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = autocompleteMatch.items[autocompleteIndex];
        if (selected) {
          handleApplySuggestion(selected);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissedAutocomplete(true);
        return;
      }
    }

    if (isSqlMode && e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? start;
      if (e.shiftKey) {
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        if (value.slice(lineStart, lineStart + 2) === '  ') {
          const next = `${value.slice(0, lineStart)}${value.slice(lineStart + 2)}`;
          onChange(next);
          window.requestAnimationFrame(() => {
            el.setSelectionRange(Math.max(lineStart, start - 2), Math.max(lineStart, end - 2));
            setCursorIndex(Math.max(lineStart, start - 2));
          });
        }
      } else {
        const next = `${value.slice(0, start)}  ${value.slice(end)}`;
        onChange(next);
        window.requestAnimationFrame(() => {
          el.setSelectionRange(start + 2, start + 2);
          setCursorIndex(start + 2);
        });
      }
      return;
    }
    onKeyDown(e);
  };

  const handleQuickFix = (diag: SqlLintDiagnostic) => {
    const fixed = applyLintQuickFix(value, diag);
    onChange(fixed);
    textareaRef.current?.focus();
  };

  const handleFixAll = () => {
    const { text, appliedCount } = applyAllLintQuickFixes(value, lint.diagnostics);
    if (appliedCount > 0) {
      onChange(text);
    }
    textareaRef.current?.focus();
  };

  const handleJumpToDiagnostic = (diag: SqlLintDiagnostic) => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(diag.start, diag.end);
    setCursorIndex(diag.start);
  };

  const totalIssues = lint.diagnostics.length;

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-1.5" data-testid="sql-lint-editor">
      {/* Live SQL Linter Status & Diagnostics Drawer */}
      {isSqlMode && (
        <div
          data-testid="sql-lint-status-bar"
          className="border border-[#141414]/25 bg-[#efece6] text-[#141414]"
        >
          <div className="px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 font-mono-label text-[9.5px]">
              <Sparkles className="w-3 h-3 text-[#141414]/70 shrink-0" aria-hidden="true" />
              <span className="text-[#141414]/80 font-semibold">
                Live SQL Linter ({dialect.toUpperCase()})
              </span>
              <span aria-hidden="true" className="text-[#141414]/30">
                ·
              </span>
              {!value.trim() ? (
                <span className="text-[#141414]/55">
                  SQL Editor active — type a query for instant syntax &amp; anti-pattern checks
                </span>
              ) : totalIssues === 0 ? (
                <span
                  data-testid="sql-lint-clean"
                  className="inline-flex items-center gap-1 text-[#15803d] font-semibold"
                >
                  <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                  <span>No syntax errors or anti-patterns</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 tabular-nums">
                  {lint.errorCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-[#dc2626] font-semibold">
                      <AlertCircle className="w-3 h-3" aria-hidden="true" />
                      <span>
                        {lint.errorCount} {lint.errorCount === 1 ? 'error' : 'errors'}
                      </span>
                    </span>
                  )}
                  {lint.warningCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-[#b45309] font-semibold">
                      <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                      <span>
                        {lint.warningCount} {lint.warningCount === 1 ? 'warning' : 'warnings'}
                      </span>
                    </span>
                  )}
                  {lint.infoCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-[#0369a1] font-semibold">
                      <Info className="w-3 h-3" aria-hidden="true" />
                      <span>
                        {lint.infoCount} {lint.infoCount === 1 ? 'hint' : 'hints'}
                      </span>
                    </span>
                  )}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 font-mono-label text-[9.5px]">
              <span
                data-testid="sql-lint-cursor"
                className="text-[#141414]/50 tabular-nums hidden sm:inline"
              >
                Ln {cursorPos.line}, Col {cursorPos.column}
              </span>

              {quickFixableCount >= 2 && (
                <button
                  type="button"
                  data-testid="sql-lint-fix-all"
                  onClick={handleFixAll}
                  className="px-2 py-0.5 bg-[#141414] text-[#efece6] hover:bg-[#2a2928] inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Wand2 className="w-2.5 h-2.5" aria-hidden="true" />
                  <span>Fix All ({quickFixableCount})</span>
                </button>
              )}

              {totalIssues > 0 && (
                <button
                  type="button"
                  onClick={() => setPanelExpanded((v) => !v)}
                  className="text-[#141414]/65 hover:text-[#141414] underline underline-offset-2 cursor-pointer"
                >
                  {panelExpanded ? 'Hide' : `Diagnostics (${totalIssues})`}
                </button>
              )}

              {forceSqlMode && !lint.isSql && onToggleForceSqlMode && (
                <button
                  type="button"
                  onClick={onToggleForceSqlMode}
                  className="text-[#141414]/55 hover:text-[#141414] inline-flex items-center gap-1 cursor-pointer"
                >
                  <Code2 className="w-3 h-3" aria-hidden="true" />
                  <span>Plain Text</span>
                </button>
              )}
            </div>
          </div>

          {activeCursorDiag && !panelExpanded && (
            <div className="px-3 py-1 border-t border-[#141414]/12 bg-[#f6f4ef] flex items-center justify-between gap-2 text-[11.5px]">
              <span className="truncate">
                <strong className="font-mono text-[10px] mr-1.5">{activeCursorDiag.code}</strong>
                {activeCursorDiag.message}
              </span>
              {activeCursorDiag.quickFix && (
                <button
                  type="button"
                  onClick={() => handleQuickFix(activeCursorDiag)}
                  className="px-2 py-0.5 border border-[#141414]/30 bg-[#efece6] hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[9px] shrink-0 cursor-pointer"
                >
                  {activeCursorDiag.quickFix.label}
                </button>
              )}
            </div>
          )}

          {totalIssues > 0 && panelExpanded && (
            <ul
              data-testid="sql-lint-diagnostics"
              aria-label="Live SQL linting diagnostics"
              className="border-t border-[#141414]/15 divide-y divide-[#141414]/10 max-h-[148px] overflow-y-auto nova-scroll bg-[#f6f4ef]"
            >
              {lint.diagnostics.map((diag) => {
                const isActive = activeCursorDiag?.id === diag.id;
                return (
                  <li
                    key={diag.id}
                    data-testid={`sql-lint-item-${diag.code}`}
                    className={`px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[12px] transition-colors ${
                      isActive ? 'bg-[#efece6]' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleJumpToDiagnostic(diag)}
                      className="flex items-start gap-2 min-w-0 flex-1 text-left hover:opacity-85 cursor-pointer"
                    >
                      {diag.severity === 'error' ? (
                        <AlertCircle
                          className="w-3.5 h-3.5 text-[#dc2626] shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                      ) : diag.severity === 'warning' ? (
                        <AlertTriangle
                          className="w-3.5 h-3.5 text-[#b45309] shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                      ) : (
                        <Info
                          className="w-3.5 h-3.5 text-[#0369a1] shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 leading-snug">
                          <span className="font-mono text-[10px] text-[#141414]/55 tabular-nums">
                            Ln {diag.line}:{diag.column}
                          </span>
                          <span
                            className={`font-mono text-[10px] font-semibold ${
                              diag.severity === 'error'
                                ? 'text-[#dc2626]'
                                : diag.severity === 'warning'
                                  ? 'text-[#b45309]'
                                  : 'text-[#0369a1]'
                            }`}
                          >
                            {diag.code}
                          </span>
                          <span className="font-medium text-[#141414]">{diag.message}</span>
                        </div>
                        <p className="text-[11px] text-[#141414]/65 leading-snug">{diag.hint}</p>
                      </div>
                    </button>

                    {diag.quickFix && (
                      <button
                        type="button"
                        data-testid={`sql-lint-fix-${diag.code}`}
                        onClick={() => handleQuickFix(diag)}
                        className="px-2 py-1 border border-[#141414]/30 bg-[#efece6] hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[9.5px] inline-flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                      >
                        <Wrench className="w-2.5 h-2.5" aria-hidden="true" />
                        <span>{diag.quickFix.label}</span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Syntax-Aware Textarea Surface */}
      <div
        data-sql-mode={isSqlMode ? 'true' : 'false'}
        className={`relative flex border transition-colors ${
          isSqlMode
            ? lint.errorCount > 0
              ? 'bg-[#19191c] border-[#dc2626]/70 focus-within:border-[#ef4444]'
              : lint.warningCount > 0
                ? 'bg-[#19191c] border-[#d97706]/65 focus-within:border-[#f59e0b]'
                : value.trim()
                  ? 'bg-[#19191c] border-[#15803d]/65 focus-within:border-[#22c55e]'
                  : 'bg-[#19191c] border-[#141414]/65 focus-within:border-[#efece6]/60'
            : 'bg-[#efece6] border-[#141414]/25 focus-within:border-[#141414]'
        }`}
      >
        {/* Line Number & Severity Gutter (visible in SQL syntax mode) */}
        {isSqlMode && (
          <div
            ref={gutterRef}
            aria-hidden="true"
            className="w-9 shrink-0 overflow-hidden select-none border-r border-[#efece6]/12 bg-[#141417] py-2.5 px-1.5 text-right font-mono text-[11px] leading-[1.6] text-[#efece6]/35 tabular-nums"
          >
            {Array.from({ length: lineCount }, (_, idx) => {
              const ln = idx + 1;
              const sev = lineSeverityMap.get(ln);
              const isCurrentLine = cursorPos.line === ln;
              return (
                <div
                  key={ln}
                  className={`flex items-center justify-end gap-1 h-[20.8px] ${
                    isCurrentLine ? 'text-[#efece6]/80 font-semibold' : ''
                  }`}
                >
                  {sev && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        sev === 'error'
                          ? 'bg-[#ef4444]'
                          : sev === 'warning'
                            ? 'bg-[#f59e0b]'
                            : 'bg-[#38bdf8]'
                      }`}
                    />
                  )}
                  <span>{ln}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="relative flex-1 min-w-0">
          {/* Synchronized Prism Syntax Highlight + Wavy Lint Squiggle Layer */}
          {isSqlMode && (
            <div
              ref={backdropRef}
              aria-hidden="true"
              data-testid="sql-lint-highlight-layer"
              className="pointer-events-none absolute inset-0 overflow-hidden px-3.5 py-2.5 font-mono text-[13px] leading-[1.6] whitespace-pre-wrap break-words"
            >
              {slices.map((slice, idx) => (
                <span
                  key={idx}
                  data-lint-severity={slice.severity ?? undefined}
                  className={`${getPrismTokenClass(slice.tokenType)} ${getSquiggleClass(slice.severity)}`}
                >
                  {slice.text}
                </span>
              ))}
              {value.endsWith('\n') ? '\n ' : ''}
            </div>
          )}

          {/* Autocomplete Suggestions Popup */}
          {autocompleteMatch && autocompleteMatch.items.length > 0 && (
            <div
              data-testid="sql-autocomplete-dropdown"
              className="absolute left-2.5 bottom-full mb-1 w-64 bg-[#fbf9f5] border border-[#141414] shadow-xl z-50 overflow-hidden divide-y divide-[#141414]/10 animate-in fade-in duration-100"
            >
              <div className="px-2.5 py-1 bg-[#efece6] flex items-center justify-between text-[10px] font-mono text-[#141414]/70">
                <span className="font-semibold flex items-center gap-1">
                  <Database className="w-3 h-3 text-[#ff5a5f]" />
                  {autocompleteMatch.title}
                </span>
                <span className="text-[9px] text-[#141414]/40">↑↓ Tab</span>
              </div>
              <div className="max-h-40 overflow-y-auto nova-scroll p-1 space-y-0.5">
                {autocompleteMatch.items.map((item, idx) => {
                  const isSelected = idx === autocompleteIndex;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleApplySuggestion(item);
                      }}
                      className={`w-full px-2 py-1 text-left font-mono text-[11px] flex items-center justify-between transition-colors cursor-pointer ${
                        isSelected ? 'bg-[#141414] text-[#efece6]' : 'text-[#141414] hover:bg-[#efece6]'
                      }`}
                    >
                      <span className="font-semibold truncate">{item.label}</span>
                      <span className={`text-[9.5px] truncate ${isSelected ? 'text-[#efece6]/70' : 'text-[#141414]/50'}`}>
                        {item.detail}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Native Accessible Textarea */}
          <textarea
            ref={textareaRef}
            id={id}
            rows={editorRows}
            value={value}
            spellCheck={!isSqlMode}
            onScroll={handleScroll}
            onClick={(e) => syncCursor(e.currentTarget)}
            onKeyUp={(e) => syncCursor(e.currentTarget)}
            onSelect={(e) => syncCursor(e.currentTarget)}
            onChange={(e) => {
              onChange(e.target.value);
              syncCursor(e.currentTarget);
            }}
            onKeyDown={handleEditorKeyDown}
            placeholder={
              isSqlMode
                ? `Write ${dialect.toUpperCase()} SQL — syntax highlighting & live anti-pattern linting run as you type...`
                : placeholder
            }
            className={`relative z-10 block w-full px-3.5 py-2.5 bg-transparent focus:outline-none resize-none ${
              isSqlMode
                ? 'font-mono text-[13px] leading-[1.6] text-transparent caret-[#f3f0ea] placeholder:text-[#efece6]/35 selection:bg-[#ff8a3d]/30'
                : 'text-[14px] leading-[1.5] text-[#141414] placeholder:text-[#141414]/45'
            }`}
          />
        </div>
      </div>
    </div>
  );
};
