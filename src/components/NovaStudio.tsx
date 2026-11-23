import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  Check,
  Code2,
  Database,
  Download,
  GitBranch,
  GitCompareArrows,
  ListPlus,
  LogIn,
  LogOut,
  PanelLeft,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCw,
  Search,
  Send,
  Trash2,
  User,
  Wrench,
  X,
} from 'lucide-react';
import type { AuthUser, ChatMessage, ChatSession, NovaMode, SqlDialect } from '../types/nova';
import {
  createQueuedMessage,
  enqueueMessage,
  getNextDispatchableMessage,
  markQueuedMessageStatus,
  moveQueuedMessage,
  removeQueuedMessage,
  updateQueuedMessagePrompt,
  type QueuedMessage,
} from '../utils/messageQueue';
import {
  buildSqlScriptExport,
  downloadTextFile,
  sanitizeFilename,
} from '../utils/exportStudio';
import { DIALECT_OPTIONS, NOVA_MODES, PRESET_SCHEMAS } from '../utils/sqlFormatter';
import { ERDiagramCanvas } from './ERDiagramCanvas';
import { MarkdownContent } from './MarkdownContent';
import { NovaLogo } from './NovaLogo';
import { QueryDiagnosticsPanel } from './QueryDiagnosticsPanel';
import { SchemaERVisualizer } from './SchemaERVisualizer';
import { SqlCodeBlock } from './SqlCodeBlock';
import { SqlLintEditor } from './SqlLintEditor';

interface NovaStudioProps {
  user: AuthUser | null;
  sessions: ChatSession[];
  activeSessionId: string;
  initialMode?: NovaMode;
  initialPrompt?: string;
  onSelectSession: (id: string) => void;
  onCreateSession: (mode: NovaMode, dialect: SqlDialect) => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onDeleteSession: (id: string) => void;
  onClearAllSessions: () => void;
  onUpdateSession: (session: ChatSession) => void;
  onBackToLanding: () => void;
  onOpenAuth: (mode?: 'login' | 'register', pendingPrompt?: string) => void;
  onOpenAccount: () => void;
  onLogout: () => void;
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export const NovaStudio: React.FC<NovaStudioProps> = ({
  user,
  sessions,
  activeSessionId,
  initialMode,
  initialPrompt,
  onSelectSession,
  onCreateSession,
  onRenameSession,
  onDeleteSession,
  onClearAllSessions,
  onUpdateSession,
  onBackToLanding,
  onOpenAuth,
  onOpenAccount,
  onLogout,
}) => {
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];

  const [mode, setMode] = useState<NovaMode>(initialMode || activeSession?.mode || 'text-to-query');
  const [dialect, setDialect] = useState<SqlDialect>(activeSession?.dialect || 'postgresql');
  const [schemaContext, setSchemaContext] = useState<string>(activeSession?.schemaContext || '');
  const [showSchemaDrawer, setShowSchemaDrawer] = useState(false);
  const [activeLab, setActiveLab] = useState<'none' | 'query' | 'schema-er' | 'schema-diff'>(() => {
    if (initialMode === 'optimize' || initialMode === 'debug') return 'query';
    if (initialMode === 'schema-builder') return 'schema-er';
    return 'none';
  });
  const [forceSqlMode, setForceSqlMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState(initialPrompt || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Queued message system state
  const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);
  const [queuePaused, setQueuePaused] = useState(false);
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [editingQueuePrompt, setEditingQueuePrompt] = useState('');

  // Chat history search, inline rename & inline delete confirmation
  const [historyQuery, setHistoryQuery] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const lastSessionRef = useRef<string>(activeSessionId);
  const lastCountRef = useRef<number>(activeSession?.messages.length ?? 0);
  const activeSessionRef = useRef<ChatSession | undefined>(activeSession);
  activeSessionRef.current = activeSession;

  useEffect(() => {
    if (activeSession) {
      setMode(initialMode ?? activeSession.mode);
      setDialect(activeSession.dialect);
      setSchemaContext(activeSession.schemaContext || '');
    }
    chatScrollRef.current?.scrollTo({ top: 0 });
    lastSessionRef.current = activeSessionId;
    lastCountRef.current = activeSession?.messages.length ?? 0;
  }, [activeSessionId]);

  useEffect(() => {
    if (initialMode) {
      setMode(initialMode);
      if (initialMode === 'optimize' || initialMode === 'debug') {
        setActiveLab('query');
      } else if (initialMode === 'schema-builder') {
        setActiveLab('schema-er');
      }
    }
  }, [initialMode]);

  useEffect(() => {
    if (initialPrompt) setInput(initialPrompt);
  }, [initialPrompt]);

  useEffect(() => {
    const count = activeSession?.messages.length ?? 0;
    if (lastSessionRef.current === activeSessionId && (loading || count > lastCountRef.current)) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    lastCountRef.current = count;
  }, [activeSession?.messages.length, loading, activeSessionId]);

  const activeModeMeta = NOVA_MODES.find((m) => m.id === mode) ?? NOVA_MODES[0];

  const filteredSessions = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.mode.toLowerCase().includes(q) ||
        s.dialect.toLowerCase().includes(q) ||
        s.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [sessions, historyQuery]);

  const handleModeSelect = (nextMode: NovaMode) => {
    setMode(nextMode);
    if (nextMode === 'optimize' || nextMode === 'debug') {
      setActiveLab('query');
    } else if (nextMode === 'schema-builder') {
      setActiveLab('schema-er');
    } else {
      setActiveLab('none');
    }
  };

  const executePromptRequest = useCallback(
    async (opts: {
      promptText: string;
      targetMode: NovaMode;
      targetDialect: SqlDialect;
      targetSchema: string;
      restoreInputOnError?: boolean;
    }): Promise<{ ok: boolean; error?: string }> => {
      const cleanPrompt = opts.promptText.trim();
      if (!cleanPrompt) return { ok: false, error: 'Prompt is empty.' };

      setError(null);
      setLoading(true);

      const currentSession = activeSessionRef.current;
      const currentMessages = currentSession?.messages ?? [];
      const history = currentMessages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: cleanPrompt,
            mode: opts.targetMode,
            dialect: opts.targetDialect,
            schemaContext: opts.targetSchema,
            sessionId:
              user && currentSession && !currentSession.id.startsWith('local_')
                ? currentSession.id
                : undefined,
            history,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          const errMsg = data.error || 'Failed to generate AI response.';
          setError(errMsg);
          if (opts.restoreInputOnError) setInput(cleanPrompt);
          return { ok: false, error: errMsg };
        }

        if (data.session) {
          onUpdateSession(data.session);
        } else {
          const now = new Date().toISOString();
          const base: ChatSession = currentSession ?? {
            id: `local_${Date.now()}`,
            title: cleanPrompt.slice(0, 42),
            mode: opts.targetMode,
            dialect: opts.targetDialect,
            schemaContext: opts.targetSchema,
            messages: [],
            createdAt: now,
            updatedAt: now,
          };
          const updated: ChatSession = {
            ...base,
            mode: opts.targetMode,
            dialect: opts.targetDialect,
            schemaContext: opts.targetSchema,
            title: base.messages.length === 0 ? cleanPrompt.slice(0, 42) : base.title,
            messages: [...base.messages, data.userMessage, data.assistantMessage],
            updatedAt: now,
          };
          onUpdateSession(updated);
        }
        return { ok: true };
      } catch {
        const errMsg = 'Network error while contacting the NOVA Agent backend.';
        setError(errMsg);
        if (opts.restoreInputOnError) setInput(cleanPrompt);
        return { ok: false, error: errMsg };
      } finally {
        setLoading(false);
      }
    },
    [user, onUpdateSession]
  );

  const sendPrompt = (promptText: string, overrideMode?: NovaMode) => {
    const cleanPrompt = promptText.trim();
    if (!user) {
      onOpenAuth('login', cleanPrompt || undefined);
      return;
    }
    if (!cleanPrompt) return;
    const targetMode = overrideMode ?? mode;

    // If a request is already in flight or items are queued ahead, enqueue this message in FIFO order
    if (loading || messageQueue.length > 0) {
      const item = createQueuedMessage({
        prompt: cleanPrompt,
        mode: targetMode,
        dialect,
        schemaContext,
      });
      setMessageQueue((prev) => enqueueMessage(prev, item));
      setInput('');
      return;
    }

    setInput('');
    void executePromptRequest({
      promptText: cleanPrompt,
      targetMode,
      targetDialect: dialect,
      targetSchema: schemaContext,
      restoreInputOnError: true,
    });
  };

  // Reset paused state once the queue is empty
  useEffect(() => {
    if (messageQueue.length === 0 && queuePaused) {
      setQueuePaused(false);
    }
  }, [messageQueue.length, queuePaused]);

  const handleComposerChange = (value: string) => {
    setInput(value);
  };

  // Automatic FIFO queue dispatcher when not busy and not paused
  useEffect(() => {
    const nextItem = getNextDispatchableMessage(messageQueue, queuePaused, loading);
    if (!nextItem) return;

    let active = true;
    setMessageQueue((prev) => markQueuedMessageStatus(prev, nextItem.id, 'sending'));

    (async () => {
      const result = await executePromptRequest({
        promptText: nextItem.prompt,
        targetMode: nextItem.mode,
        targetDialect: nextItem.dialect,
        targetSchema: nextItem.schemaContext,
        restoreInputOnError: false,
      });
      if (!active) return;
      if (result.ok) {
        setMessageQueue((prev) => removeQueuedMessage(prev, nextItem.id));
      } else {
        setMessageQueue((prev) =>
          markQueuedMessageStatus(prev, nextItem.id, 'failed', result.error || 'Dispatch failed.')
        );
        setQueuePaused(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [messageQueue, queuePaused, loading, executePromptRequest]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendPrompt(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPrompt(input);
    }
  };

  const commitRename = (sessionId: string) => {
    const clean = editingTitle.trim();
    if (clean) {
      onRenameSession(sessionId, clean);
    }
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const renderMessage = (msg: ChatMessage) => {
    if (msg.role === 'user') {
      const msgModeLabel = NOVA_MODES.find((m) => m.id === msg.mode)?.shortLabel ?? msg.mode;
      return (
        <div key={msg.id} className="flex justify-end">
          <div className="max-w-[82%] bg-[#141414] text-[#efece6] px-4 py-3 border border-[#141414]">
            <div className="font-mono-label text-[9.5px] text-[#efece6]/55 mb-1.5 flex items-center justify-between gap-4">
              <span>{msgModeLabel}</span>
              <span>{msg.dialect}</span>
            </div>
            <MarkdownContent
              content={msg.content}
              tone="dark"
              className="text-[14px] leading-[1.55]"
            />
          </div>
        </div>
      );
    }

    const payload = msg.payload;
    return (
      <article key={msg.id} className="border border-[#141414]/20 bg-[#f6f4ef] p-5 space-y-5">
        {/* Assistant Header */}
        <div className="flex items-center justify-between gap-4 pb-3 border-b border-[#141414]/12">
          <div className="flex items-center gap-2.5 font-mono-label text-[10px] text-[#141414]/65">
            <span className="font-semibold text-[#141414]">NOVA AGENT</span>
            <span aria-hidden="true">·</span>
            <span>{NOVA_MODES.find((m) => m.id === msg.mode)?.label ?? msg.mode}</span>
            <span aria-hidden="true">·</span>
            <span>{msg.dialect}</span>
          </div>
        </div>

        {/* Summary (Markdown enabled: code blocks, tables, lists, headings, inline code) */}
        <MarkdownContent
          content={payload?.summary || msg.content}
          tone="light"
          className="text-[15px] leading-[1.6]"
        />

        {/* Interactive ER Diagram */}
        {payload?.erDiagram && payload.erDiagram.entities?.length > 0 && (
          <ERDiagramCanvas diagram={payload.erDiagram} dialect={msg.dialect} />
        )}

        {/* Side-by-side Original vs Rewritten Code */}
        {payload?.originalCode && payload?.primaryCode && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <SqlCodeBlock
              code={payload.originalCode}
              label="Original Query"
              language={payload.codeLanguage || 'sql'}
              compact
            />
            <SqlCodeBlock
              code={payload.primaryCode}
              label={
                msg.mode === 'debug'
                  ? 'Fixed Query'
                  : msg.mode === 'optimize'
                    ? 'Optimized Query'
                    : 'Converted Query'
              }
              language={payload.codeLanguage || 'sql'}
              compact
            />
          </div>
        )}

        {/* Primary Code Output */}
        {!payload?.originalCode && payload?.primaryCode && (
          <SqlCodeBlock
            code={payload.primaryCode}
            label={
              msg.mode === 'er-diagram'
                ? 'Generated Schema DDL'
                : `${msg.dialect.toUpperCase()} Query`
            }
            language={payload.codeLanguage || 'sql'}
          />
        )}

        {/* Debug Issues */}
        {payload?.debugIssues && payload.debugIssues.length > 0 && (
          <div className="space-y-2.5">
            <h4 className="font-mono-label text-[10.5px] text-[#141414]/70">
              Diagnosed Issues ({payload.debugIssues.length})
            </h4>
            <div className="border-t border-[#141414]/15 divide-y divide-[#141414]/12">
              {payload.debugIssues.map((bug, i) => (
                <div key={i} className="py-3 grid grid-cols-1 md:grid-cols-[160px_1fr] gap-2">
                  <div>
                    <div className="font-mono text-[11px] font-medium text-[#141414]">
                      {bug.lineOrClause}
                    </div>
                    <div className="font-mono-label text-[9.5px] text-[#dc2626] mt-0.5">
                      {bug.severity}
                    </div>
                  </div>
                  <div className="space-y-1 text-[13.5px] leading-[1.5]">
                    <div className="text-[#141414]">
                      <MarkdownContent content={bug.issue} tone="light" inlineOnly />
                    </div>
                    <div className="text-[#141414]/75">
                      <span className="font-mono-label text-[10px] mr-1.5">Fix:</span>
                      <MarkdownContent content={bug.fix} tone="light" inlineOnly />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Optimization Tips */}
        {payload?.optimizationTips && payload.optimizationTips.length > 0 && (
          <div className="space-y-2.5">
            <h4 className="font-mono-label text-[10.5px] text-[#141414]/70">
              Optimization Breakdown
            </h4>
            <div className="border-t border-[#141414]/15 divide-y divide-[#141414]/12">
              {payload.optimizationTips.map((tip, i) => (
                <div
                  key={i}
                  className="py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="text-[14px] font-medium text-[#141414]">
                      <MarkdownContent content={tip.title} tone="light" inlineOnly />
                    </div>
                    <div className="text-[13.5px] leading-[1.5] text-[#141414]/75">
                      <MarkdownContent content={tip.detail} tone="light" />
                    </div>
                  </div>
                  <span className="font-mono-label text-[10px] text-[#141414]/75 shrink-0">
                    Impact: {tip.impact}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Index Recommendations */}
        {payload?.indexRecommendations && payload.indexRecommendations.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-mono-label text-[10.5px] text-[#141414]/70">
              Recommended Indexes
            </h4>
            <SqlCodeBlock
              code={payload.indexRecommendations.join('\n')}
              label="Index DDL"
              language="sql"
              compact
            />
          </div>
        )}

        {/* Explanation Steps */}
        {payload?.explanationSteps && payload.explanationSteps.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-mono-label text-[10.5px] text-[#141414]/70">
              Step-by-Step Analysis
            </h4>
            <ol className="space-y-2">
              {payload.explanationSteps.map((step, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 text-[13.5px] leading-[1.55] text-[#141414]/85"
                >
                  <span className="font-mono text-[11px] tabular-nums text-[#141414]/45 pt-0.5 shrink-0">
                    {String(i + 1).padStart(2, '0')}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <MarkdownContent content={step} tone="light" className="text-[13.5px]" />
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Follow-up Suggestions */}
        {payload?.followUpSuggestions && payload.followUpSuggestions.length > 0 && (
          <div className="pt-3 border-t border-[#141414]/12 flex flex-wrap gap-2">
            {payload.followUpSuggestions.map((sugg, i) => (
              <button
                key={i}
                type="button"
                disabled={loading}
                onClick={() => sendPrompt(sugg)}
                className="text-left px-3 py-1.5 border border-[#141414]/20 bg-[#efece6] hover:bg-[#141414] hover:text-[#efece6] text-[12px] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>{sugg}</span>
                <ArrowUpRight className="w-3 h-3 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </article>
    );
  };

  return (
    <div
      data-testid="nova-studio-workspace"
      className="h-screen w-full bg-[#efece6] text-[#141414] flex flex-col overflow-hidden"
    >
      {/* Top Studio Header */}
      <header className="h-[54px] shrink-0 border-b border-[#141414]/15 bg-[#efece6] px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            aria-label="Toggle sessions sidebar"
            onClick={() => setSidebarOpen((v) => !v)}
            className="lg:hidden p-2 border border-[#141414]/20 hover:bg-[#141414]/5 cursor-pointer"
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onBackToLanding}
            className="inline-flex items-center gap-2 hover:opacity-75 transition-opacity cursor-pointer"
          >
            <NovaLogo compact />
            <span className="text-[16px] font-medium tracking-[-0.02em] whitespace-nowrap">
              NOVA STUDIO
            </span>
          </button>

          <button
            type="button"
            onClick={onBackToLanding}
            className="hidden sm:inline-flex items-center gap-1.5 pl-3 ml-1 border-l border-[#141414]/15 font-mono-label text-[10.5px] text-[#141414]/65 hover:text-[#141414] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>3D Showcase</span>
          </button>
        </div>

        {/* Right Controls: Dialect, Schema Context, Account */}
        <div className="flex items-center gap-2.5 shrink-0">
          <label htmlFor="studio-dialect" className="sr-only">
            SQL Dialect
          </label>
          <select
            id="studio-dialect"
            value={dialect}
            onChange={(e) => setDialect(e.target.value as SqlDialect)}
            className="h-8 px-2.5 bg-[#f6f4ef] border border-[#141414]/25 font-mono-label text-[10.5px] text-[#141414] focus:outline-none focus:border-[#141414] cursor-pointer"
          >
            {DIALECT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowSchemaDrawer((v) => !v)}
            className={`h-8 px-3 border font-mono-label text-[10.5px] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showSchemaDrawer || schemaContext.trim()
                ? 'border-[#141414] bg-[#141414] text-[#efece6]'
                : 'border-[#141414]/25 bg-[#f6f4ef] text-[#141414] hover:border-[#141414]'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span className="hidden md:inline">
              {schemaContext.trim() ? 'Schema Active' : 'Schema Context'}
            </span>
          </button>

          {user ? (
            <div className="flex items-center gap-2 pl-2 border-l border-[#141414]/15">
              <button
                type="button"
                onClick={onOpenAccount}
                className="hidden md:inline-flex items-center gap-1.5 h-8 px-2.5 border border-[#141414]/20 bg-[#f6f4ef] hover:border-[#141414] font-mono-label text-[10.5px] text-[#141414] max-w-[150px] truncate cursor-pointer"
              >
                <User className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{user.name}</span>
              </button>
              <button
                type="button"
                aria-label="Sign out"
                onClick={onLogout}
                className="h-8 px-2.5 border border-[#141414]/25 bg-[#f6f4ef] hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[10.5px] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="nova-launch-btn h-8 px-3 font-mono-label text-[10.5px] text-[#141414] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Split Body */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Left Chat History Sidebar */}
        <aside
          aria-label="Chat history"
          className={`${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          } fixed lg:static inset-y-[54px] left-0 z-30 w-[280px] shrink-0 bg-[#efece6] border-r border-[#141414]/15 flex flex-col transition-transform duration-200`}
        >
          <div className="p-3 border-b border-[#141414]/15 space-y-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onCreateSession(mode, dialect);
                  setSidebarOpen(false);
                }}
                className="flex-1 h-9 bg-[#141414] text-[#efece6] hover:bg-[#2a2928] font-mono-label text-[10.5px] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Query Thread</span>
              </button>
              <button
                type="button"
                aria-label="Close sidebar"
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-2 border border-[#141414]/20 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* History Search Input */}
            <div className="relative">
              <Search
                aria-hidden="true"
                className="w-3.5 h-3.5 text-[#141414]/45 absolute left-2.5 top-1/2 -translate-y-1/2"
              />
              <label htmlFor="history-search" className="sr-only">
                Search past conversations
              </label>
              <input
                id="history-search"
                type="search"
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
                placeholder="Search chat history..."
                className="w-full h-8 pl-8 pr-2.5 bg-[#f6f4ef] border border-[#141414]/20 text-[12.5px] focus:outline-none focus:border-[#141414]"
              />
            </div>
          </div>

          {/* Saved Conversations List */}
          <div className="flex-1 overflow-y-auto nova-scroll p-3 space-y-1.5">
            <div className="px-1.5 py-1 flex items-center justify-between gap-2 font-mono-label text-[10px] text-[#141414]/50">
              <span>
                {user ? 'Saved History' : 'Conversation History'} ({filteredSessions.length})
              </span>
              {sessions.length > 0 && !confirmClearAll && (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="text-[#141414]/55 hover:text-[#dc2626] transition-colors cursor-pointer"
                >
                  Clear All
                </button>
              )}
            </div>

            {confirmClearAll && (
              <div className="p-2.5 border border-[#dc2626]/30 bg-[#dc2626]/5 flex items-center justify-between gap-2">
                <span className="font-mono-label text-[9.5px] text-[#991b1b]">
                  Clear all chats?
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onClearAllSessions();
                      setConfirmClearAll(false);
                    }}
                    className="px-2 py-0.5 bg-[#dc2626] text-white font-mono-label text-[9.5px] cursor-pointer"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="px-2 py-0.5 border border-[#141414]/25 font-mono-label text-[9.5px] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {filteredSessions.length === 0 ? (
              <div className="px-2 py-6 text-center text-[12.5px] text-[#141414]/55">
                {historyQuery.trim()
                  ? 'No matching conversations found.'
                  : 'No conversations yet. Send a prompt or open Schema ER Lab to begin.'}
              </div>
            ) : (
              filteredSessions.map((ses) => {
                const isCurrent = ses.id === activeSession?.id;
                const isEditing = editingSessionId === ses.id;
                const isConfirmingDelete = confirmDeleteId === ses.id;

                return (
                  <div
                    key={ses.id}
                    className={`group border transition-colors ${
                      isCurrent
                        ? 'border-[#141414]/40 bg-[#f6f4ef]'
                        : 'border-transparent hover:border-[#141414]/15 hover:bg-[#f6f4ef]/60'
                    }`}
                  >
                    {isEditing ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          commitRename(ses.id);
                        }}
                        className="p-2 flex items-center gap-1"
                      >
                        <input
                          type="text"
                          aria-label="Conversation title"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          autoFocus
                          className="flex-1 min-w-0 h-7 px-2 bg-[#efece6] border border-[#141414]/40 text-[12.5px] focus:outline-none"
                        />
                        <button
                          type="submit"
                          aria-label="Save conversation name"
                          className="p-1.5 bg-[#141414] text-[#efece6] cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          aria-label="Cancel rename"
                          onClick={() => setEditingSessionId(null)}
                          className="p-1.5 border border-[#141414]/20 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </form>
                    ) : isConfirmingDelete ? (
                      <div className="p-2.5 flex items-center justify-between gap-2 bg-[#dc2626]/5">
                        <span className="font-mono-label text-[10px] text-[#991b1b]">
                          Delete thread?
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteSession(ses.id);
                              setConfirmDeleteId(null);
                            }}
                            className="px-2 py-0.5 bg-[#dc2626] text-white font-mono-label text-[9.5px] cursor-pointer"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-0.5 border border-[#141414]/25 font-mono-label text-[9.5px] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectSession(ses.id);
                            setSidebarOpen(false);
                          }}
                          className="flex-1 min-w-0 px-2.5 py-2 text-left cursor-pointer"
                        >
                          <div className="text-[13px] font-medium text-[#141414] truncate">
                            {ses.title}
                          </div>
                          <div className="font-mono-label text-[9.5px] text-[#141414]/50 truncate mt-0.5 tabular-nums">
                            {NOVA_MODES.find((m) => m.id === ses.mode)?.shortLabel ?? ses.mode} ·{' '}
                            {ses.messages.length} {ses.messages.length === 1 ? 'msg' : 'msgs'} ·{' '}
                            {formatShortDate(ses.updatedAt)}
                          </div>
                        </button>

                        <div className="flex items-center pr-1 shrink-0">
                          <button
                            type="button"
                            aria-label={`Rename thread ${ses.title}`}
                            onClick={() => {
                              setEditingSessionId(ses.id);
                              setEditingTitle(ses.title);
                              setConfirmDeleteId(null);
                            }}
                            className="p-1.5 text-[#141414]/35 hover:text-[#141414] transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete thread ${ses.title}`}
                            onClick={() => {
                              setConfirmDeleteId(ses.id);
                              setEditingSessionId(null);
                            }}
                            className="p-1.5 text-[#141414]/35 hover:text-[#dc2626] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Account Sync Box */}
          <div className="p-3.5 border-t border-[#141414]/15 bg-[#f6f4ef]">
            {user ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[12.5px] font-medium text-[#141414] truncate">
                    {user.name}
                  </div>
                  <button
                    type="button"
                    onClick={onOpenAccount}
                    className="font-mono-label text-[9.5px] underline underline-offset-2 text-[#141414]/70 hover:text-[#141414] cursor-pointer"
                  >
                    Security
                  </button>
                </div>
                <div className="font-mono text-[10.5px] text-[#141414]/55 truncate">
                  {user.email}
                </div>
                <div className="font-mono-label text-[9.5px] text-[#141414]/50">
                  Synced to backend storage
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[12px] leading-[1.45] text-[#141414]/70">
                  Sign in to persist your SQL queries, ER diagrams, and history across devices.
                </p>
                <button
                  type="button"
                  onClick={() => onOpenAuth('login')}
                  className="w-full py-1.5 border border-[#141414]/30 hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[10px] transition-colors cursor-pointer"
                >
                  Continue with Google
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Main Workspace Column */}
        <main id="main-content" className="flex-1 flex flex-col min-w-0 bg-[#efece6]">
          {/* Mode Selector Bar + Studio Lab Toggles */}
          <div className="shrink-0 border-b border-[#141414]/15 bg-[#f6f4ef] px-4 py-2 flex items-center justify-between gap-3 overflow-x-auto nova-scroll">
            <div role="tablist" aria-label="AI Database Tools" className="flex items-center gap-1">
              {NOVA_MODES.map((item) => {
                const active = mode === item.id;
                return (
                  <button
                    key={item.id}
                    role="tab"
                    type="button"
                    aria-selected={active}
                    onClick={() => handleModeSelect(item.id)}
                    className={`px-2.5 py-1.5 font-mono-label text-[10px] whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#141414] text-[#efece6] border-[#141414]'
                        : 'bg-[#efece6] text-[#141414]/75 border-[#141414]/15 hover:border-[#141414]/40 hover:text-[#141414]'
                    }`}
                  >
                    {item.shortLabel}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                data-testid="schema-er-toggle"
                onClick={() =>
                  setActiveLab((prev) => (prev === 'schema-er' ? 'none' : 'schema-er'))
                }
                className={`px-2.5 py-1.5 font-mono-label text-[10px] whitespace-nowrap shrink-0 border inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeLab === 'schema-er'
                    ? 'border-[#ff5a5f] bg-[#141414] text-[#efece6]'
                    : 'border-[#141414]/25 bg-[#efece6] text-[#141414] hover:border-[#141414]'
                }`}
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span>{activeLab === 'schema-er' ? 'Close ER' : 'Schema ER'}</span>
              </button>

              <button
                type="button"
                data-testid="schema-diff-toggle"
                onClick={() =>
                  setActiveLab((prev) => (prev === 'schema-diff' ? 'none' : 'schema-diff'))
                }
                className={`px-2.5 py-1.5 font-mono-label text-[10px] whitespace-nowrap shrink-0 border inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeLab === 'schema-diff'
                    ? 'border-[#ff5a5f] bg-[#141414] text-[#efece6]'
                    : 'border-[#141414]/25 bg-[#efece6] text-[#141414] hover:border-[#141414]'
                }`}
              >
                <GitCompareArrows className="w-3.5 h-3.5" />
                <span>{activeLab === 'schema-diff' ? 'Close Diff' : 'Schema Diff'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveLab((prev) => (prev === 'query' ? 'none' : 'query'))}
                className={`px-2.5 py-1.5 font-mono-label text-[10px] whitespace-nowrap shrink-0 border inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeLab === 'query'
                    ? 'border-[#ff5a5f] bg-[#141414] text-[#efece6]'
                    : 'border-[#141414]/25 bg-[#efece6] text-[#141414] hover:border-[#141414]'
                }`}
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>{activeLab === 'query' ? 'Close Lab' : 'Query Lab'}</span>
              </button>
            </div>
          </div>

          {/* Optional Collapsible Schema Context Drawer */}
          {showSchemaDrawer && (
            <div className="shrink-0 border-b border-[#141414]/20 bg-[#f6f4ef] px-4 py-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono-label text-[10.5px] font-medium text-[#141414]">
                    Active Schema DDL Context
                  </span>
                  <span className="ml-2 text-[12px] text-[#141414]/60">
                    Ground AI queries in your exact tables and columns
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {PRESET_SCHEMAS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setSchemaContext(preset.ddl)}
                      className="px-2.5 py-1 border border-[#141414]/20 bg-[#efece6] hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[9.5px] transition-colors cursor-pointer"
                    >
                      Load {preset.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveLab('schema-er');
                      setShowSchemaDrawer(false);
                    }}
                    className="px-2.5 py-1 border border-[#141414] bg-[#141414] text-[#efece6] hover:bg-[#2a2928] font-mono-label text-[9.5px] inline-flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <GitBranch className="w-3 h-3" />
                    <span>Visualize ER</span>
                  </button>
                  {schemaContext.trim() && (
                    <>
                      <button
                        type="button"
                        data-testid="schema-context-export-sql"
                        onClick={() => {
                          const script = buildSqlScriptExport(schemaContext, {
                            title: activeSession?.title || 'Active Schema Context',
                            dialect,
                          });
                          downloadTextFile(
                            script,
                            sanitizeFilename(`nova-schema-${dialect}`, 'sql'),
                            'application/sql;charset=utf-8'
                          );
                        }}
                        className="px-2.5 py-1 border border-[#141414]/25 bg-[#efece6] hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[9.5px] inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        <span>Export .SQL</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSchemaContext('')}
                        className="px-2 py-1 font-mono-label text-[9.5px] text-[#dc2626] hover:underline cursor-pointer"
                      >
                        Clear
                      </button>
                    </>
                  )}
                </div>
              </div>
              <textarea
                value={schemaContext}
                onChange={(e) => setSchemaContext(e.target.value)}
                rows={4}
                placeholder="Paste your CREATE TABLE statements here..."
                className="w-full p-3 bg-[#efece6] border border-[#141414]/25 font-mono text-[12px] leading-[1.5] focus:outline-none focus:border-[#141414] resize-y"
              />
            </div>
          )}

          {/* Scrollable Messages + Studio Labs Viewport */}
          <div
            ref={chatScrollRef}
            className="flex-1 overflow-y-auto nova-scroll px-4 sm:px-6 lg:px-10 py-6"
          >
            <div className="max-w-[980px] mx-auto space-y-6">
              {(activeLab === 'schema-er' || activeLab === 'schema-diff') && (
                <SchemaERVisualizer
                  dialect={dialect}
                  schemaContext={schemaContext}
                  loading={loading}
                  initialTab={activeLab === 'schema-diff' ? 'diff' : 'mermaid'}
                  onSyncSchemaContext={(ddlText) => setSchemaContext(ddlText)}
                  onRunSchemaAudit={(prompt, targetMode) => sendPrompt(prompt, targetMode)}
                />
              )}

              {activeLab === 'query' && (
                <QueryDiagnosticsPanel
                  dialect={dialect}
                  mode={mode}
                  loading={loading}
                  onRunDeepAi={(prompt, targetMode) => sendPrompt(prompt, targetMode)}
                />
              )}

              {(!activeSession || activeSession.messages.length === 0) && activeLab === 'none' && (
                <div className="py-8 space-y-6">
                  <div className="space-y-2">
                    <p className="font-mono-label text-[10.5px] text-[#141414]/55">
                      {activeModeMeta.label} · {dialect.toUpperCase()}
                    </p>
                    <h1 className="text-[clamp(26px,3vw,38px)] font-normal tracking-[-0.025em] leading-[1.12] max-w-2xl">
                      {activeModeMeta.description}
                    </h1>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activeModeMeta.samplePrompts.map((sample, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => sendPrompt(sample)}
                        className="text-left p-4 border border-[#141414]/20 bg-[#f6f4ef] hover:border-[#141414] transition-colors flex flex-col justify-between gap-3 cursor-pointer group"
                      >
                        <span className="text-[13.5px] leading-[1.5] text-[#141414]">
                          {sample}
                        </span>
                        <span className="font-mono-label text-[10px] text-[#141414]/55 group-hover:text-[#ff5a5f] inline-flex items-center gap-1">
                          <span>Run Prompt</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeSession?.messages.map(renderMessage)}

              {loading && (
                <div className="border border-[#141414]/20 bg-[#f6f4ef] p-5 space-y-3">
                  <div className="font-mono-label text-[10px] text-[#141414]/65">
                    NOVA AGENT · Generating {activeModeMeta.label}...
                  </div>
                  <div className="h-3 w-2/3 bg-[#141414]/10 animate-pulse" />
                  <div className="h-3 w-1/2 bg-[#141414]/10 animate-pulse" />
                  <div className="h-24 w-full bg-[#141414]/[0.07] animate-pulse" />
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="border border-[#dc2626]/40 bg-[#dc2626]/10 px-4 py-3 text-[#991b1b] text-[13.5px] flex items-start gap-2.5"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium">Request could not be completed</div>
                    <p className="text-[13px] mt-0.5">{error}</p>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Queued Message Strip */}
          {messageQueue.length > 0 && (
            <section
              aria-label="Queued messages"
              data-testid="message-queue-panel"
              className="shrink-0 border-t border-[#141414]/20 bg-[#efece6] px-4 sm:px-6 lg:px-10 py-2.5"
            >
              <div className="max-w-[980px] mx-auto space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-mono-label text-[10px] text-[#141414]">
                    <span className="font-semibold tabular-nums">
                      Queued Messages ({messageQueue.length})
                    </span>
                    <span aria-hidden="true" className="text-[#141414]/35">
                      ·
                    </span>
                    <span className="text-[#141414]/60">
                      {queuePaused ? 'Paused — edit or reorder before sending' : 'Auto-sending in FIFO order'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setQueuePaused((p) => !p)}
                      className={`h-7 px-2.5 border font-mono-label text-[9.5px] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                        queuePaused
                          ? 'bg-[#141414] text-[#efece6] border-[#141414] hover:bg-[#2a2928]'
                          : 'bg-[#f6f4ef] text-[#141414] border-[#141414]/25 hover:border-[#141414]'
                      }`}
                    >
                      {queuePaused ? (
                        <>
                          <Play className="w-3 h-3" />
                          <span>Run Queue</span>
                        </>
                      ) : (
                        <>
                          <Pause className="w-3 h-3" />
                          <span>Pause Queue</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMessageQueue((prev) => prev.filter((item) => item.status === 'sending'));
                        setEditingQueueId(null);
                      }}
                      className="h-7 px-2.5 border border-[#141414]/20 bg-[#f6f4ef] hover:border-[#dc2626] hover:text-[#dc2626] font-mono-label text-[9.5px] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Clear Queue
                    </button>
                  </div>
                </div>

                <ol className="max-h-[152px] overflow-y-auto nova-scroll border border-[#141414]/15 bg-[#f6f4ef] divide-y divide-[#141414]/12">
                  {messageQueue.map((item, idx) => {
                    const isEditingItem = editingQueueId === item.id;
                    const modeLabel =
                      NOVA_MODES.find((m) => m.id === item.mode)?.shortLabel ?? item.mode;
                    return (
                      <li
                        key={item.id}
                        className="px-3 py-2 flex items-center justify-between gap-3 text-[12.5px]"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="font-mono text-[10.5px] tabular-nums text-[#141414]/45 shrink-0">
                            {String(idx + 1).padStart(2, '0')}
                          </span>

                          {isEditingItem ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                setMessageQueue((prev) =>
                                  updateQueuedMessagePrompt(prev, item.id, editingQueuePrompt)
                                );
                                setEditingQueueId(null);
                              }}
                              className="flex-1 flex items-center gap-1.5 min-w-0"
                            >
                              <input
                                type="text"
                                aria-label="Edit queued message"
                                value={editingQueuePrompt}
                                onChange={(e) => setEditingQueuePrompt(e.target.value)}
                                autoFocus
                                className="flex-1 min-w-0 h-7 px-2 bg-[#efece6] border border-[#141414]/40 text-[12.5px] focus:outline-none"
                              />
                              <button
                                type="submit"
                                aria-label="Save queued message"
                                className="p-1.5 bg-[#141414] text-[#efece6] cursor-pointer"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                aria-label="Cancel queue edit"
                                onClick={() => setEditingQueueId(null)}
                                className="p-1.5 border border-[#141414]/20 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </form>
                          ) : (
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[#141414]">{item.prompt}</div>
                              <div className="font-mono-label text-[9.5px] text-[#141414]/55 flex items-center gap-1.5 mt-0.5">
                                <span>{modeLabel}</span>
                                <span aria-hidden="true">·</span>
                                <span>{item.dialect}</span>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={
                                    item.status === 'failed'
                                      ? 'text-[#dc2626] font-semibold'
                                      : item.status === 'sending'
                                        ? 'text-[#ff5a5f] font-semibold'
                                        : ''
                                  }
                                >
                                  {item.status === 'sending'
                                    ? 'Sending...'
                                    : item.status === 'failed'
                                      ? `Failed: ${item.error || 'Error'}`
                                      : 'Queued'}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {!isEditingItem && item.status !== 'sending' && (
                          <div className="flex items-center gap-1 shrink-0">
                            {item.status === 'failed' && (
                              <button
                                type="button"
                                aria-label={`Retry queued message ${idx + 1}`}
                                onClick={() => {
                                  setMessageQueue((prev) =>
                                    markQueuedMessageStatus(prev, item.id, 'queued')
                                  );
                                  setQueuePaused(false);
                                }}
                                className="p-1 text-[#141414]/70 hover:text-[#141414] cursor-pointer"
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              aria-label={`Move queued message ${idx + 1} up`}
                              disabled={idx === 0 || messageQueue[idx - 1]?.status === 'sending'}
                              onClick={() =>
                                setMessageQueue((prev) => moveQueuedMessage(prev, item.id, 'up'))
                              }
                              className="p-1 text-[#141414]/55 hover:text-[#141414] disabled:opacity-25 cursor-pointer"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Move queued message ${idx + 1} down`}
                              disabled={idx === messageQueue.length - 1}
                              onClick={() =>
                                setMessageQueue((prev) => moveQueuedMessage(prev, item.id, 'down'))
                              }
                              className="p-1 text-[#141414]/55 hover:text-[#141414] disabled:opacity-25 cursor-pointer"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Edit queued message ${idx + 1}`}
                              onClick={() => {
                                setEditingQueueId(item.id);
                                setEditingQueuePrompt(item.prompt);
                              }}
                              className="p-1 text-[#141414]/55 hover:text-[#141414] cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove queued message ${idx + 1}`}
                              onClick={() =>
                                setMessageQueue((prev) => removeQueuedMessage(prev, item.id))
                              }
                              className="p-1 text-[#141414]/55 hover:text-[#dc2626] cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            </section>
          )}

          {/* Bottom Prompt Composer */}
          <form
            onSubmit={handleSubmit}
            className="shrink-0 border-t border-[#141414]/15 bg-[#f6f4ef] px-4 sm:px-6 lg:px-10 py-3.5"
          >
            <div className="max-w-[980px] mx-auto flex flex-col gap-2">
              {!user && (
                <div
                  data-testid="prompt-login-gate"
                  className="px-3 py-2 border border-[#141414]/20 bg-[#efece6] flex flex-wrap items-center justify-between gap-2 text-[12px]"
                >
                  <span className="text-[#141414]/80">
                    Sign in with Google to run AI prompts — live SQL syntax highlighting &amp; linting works as you type.
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenAuth('login', input.trim() || undefined)}
                      className="px-3 py-1 bg-[#141414] text-[#efece6] hover:bg-[#2a2928] font-mono-label text-[9.5px] transition-colors cursor-pointer"
                    >
                      Continue with Google
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <label htmlFor="nova-chat-input" className="sr-only">
                    Enter your SQL or database prompt
                  </label>
                  <SqlLintEditor
                    id="nova-chat-input"
                    value={input}
                    dialect={dialect}
                    forceSqlMode={forceSqlMode}
                    onToggleForceSqlMode={() => setForceSqlMode((v) => !v)}
                    onChange={handleComposerChange}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      loading
                        ? 'NOVA is responding — type a follow-up to add it to the message queue...'
                        : activeModeMeta.placeholder
                    }
                  />
                </div>

                <button
                  type="submit"
                  data-testid="composer-submit-btn"
                  disabled={user ? !input.trim() : false}
                  className="h-[58px] px-5 bg-[#141414] text-[#efece6] hover:bg-[#2a2928] disabled:opacity-40 font-mono-label text-[11px] inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>{!user ? 'Sign In' : loading ? 'Queue Next' : 'Run'}</span>
                  {loading && user ? (
                    <ListPlus className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 font-mono-label text-[9.5px] text-[#141414]/55">
                <div className="flex flex-wrap items-center gap-2">
                  <span>
                    Mode: {activeModeMeta.label} · Dialect: {dialect}
                    {messageQueue.length > 0 ? ` · ${messageQueue.length} queued` : ''}
                  </span>
                  <button
                    type="button"
                    data-testid="toggle-sql-editor-mode"
                    onClick={() => setForceSqlMode((v) => !v)}
                    className={`px-1.5 py-0.5 border inline-flex items-center gap-1 transition-colors cursor-pointer ${
                      forceSqlMode
                        ? 'border-[#141414] bg-[#141414] text-[#efece6]'
                        : 'border-[#141414]/20 bg-[#efece6] hover:bg-[#141414] hover:text-[#efece6] text-[#141414]/75'
                    }`}
                  >
                    <Code2 className="w-3 h-3" aria-hidden="true" />
                    <span>{forceSqlMode ? 'SQL Editor: ON' : 'SQL Editor'}</span>
                  </button>
                  <button
                    type="button"
                    data-testid="load-sql-lint-sample"
                    onClick={() =>
                      setInput(
                        "SELECT *, FROM orders\nWHERE deleted_at = NULL\n  AND AND YEAR(created_at) = 2026\nORDER BY created_at DESC"
                      )
                    }
                    className="px-1.5 py-0.5 border border-[#141414]/20 bg-[#efece6] hover:bg-[#141414] hover:text-[#efece6] text-[#141414]/75 transition-colors cursor-pointer"
                  >
                    Load Lint Sample
                  </button>
                </div>
                <span>
                  {!user
                    ? 'Google Sign-In required to submit · Live SQL linter active'
                    : `Enter to ${loading ? 'queue' : 'send'} · Shift+Enter for new line`}
                </span>
              </div>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
};
