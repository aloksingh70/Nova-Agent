import React, { useState, useEffect } from 'react';
import {
  Bookmark,
  Share2,
  Trash2,
  Copy,
  Check,
  GitCompare,
  Plus,
  X,
  FileCode,
  Database,
  ExternalLink,
} from 'lucide-react';
import type { SqlDialect } from '../types/nova';

export interface SavedSnippetItem {
  id: string;
  title: string;
  description?: string;
  type: 'cte' | 'ddl' | 'query';
  dialect: SqlDialect;
  code: string;
  createdAt: string;
}

interface SnippetLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadSnippet: (code: string, dialect?: SqlDialect) => void;
  onCompareSnapshots?: (baseDdl: string, targetDdl: string) => void;
  currentCode?: string;
  currentDialect?: SqlDialect;
}

const STORAGE_KEY = 'nova_snippet_library_v1';

const DEFAULT_PRESET_SNIPPETS: SavedSnippetItem[] = [
  {
    id: 'snip_recursive_cte',
    title: 'Recursive Org Hierarchy CTE',
    description: 'Find all direct and indirect reportees under a management chain.',
    type: 'cte',
    dialect: 'postgresql',
    code: `WITH RECURSIVE org_chart AS (
  SELECT id, name, manager_id, 1 AS depth
  FROM employees
  WHERE manager_id IS NULL
  UNION ALL
  SELECT e.id, e.name, e.manager_id, oc.depth + 1
  FROM employees e
  JOIN org_chart oc ON e.manager_id = oc.id
)
SELECT * FROM org_chart ORDER BY depth, name;`,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'snip_schema_v1',
    title: 'E-Commerce Schema v1.0',
    description: 'Base customer and orders relational architecture.',
    type: 'ddl',
    dialect: 'postgresql',
    code: `CREATE TABLE customers (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE orders (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  total_cents INT NOT NULL
);`,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'snip_schema_v2',
    title: 'E-Commerce Schema v2.0',
    description: 'Extended schema with coupons, order items, and subscriptions.',
    type: 'ddl',
    dialect: 'postgresql',
    code: `CREATE TABLE customers (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  tier VARCHAR(32) NOT NULL DEFAULT 'standard',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  status VARCHAR(32) NOT NULL,
  amount_cents INT NOT NULL
);

CREATE TABLE orders (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  total_cents INT NOT NULL
);`,
    createdAt: new Date().toISOString(),
  },
];

export const SnippetLibraryModal: React.FC<SnippetLibraryModalProps> = ({
  isOpen,
  onClose,
  onLoadSnippet,
  onCompareSnapshots,
  currentCode = '',
  currentDialect = 'postgresql',
}) => {
  const [snippets, setSnippets] = useState<SavedSnippetItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return DEFAULT_PRESET_SNIPPETS;
  });

  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<'cte' | 'ddl' | 'query'>('query');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sharedLink, setSharedLink] = useState<string | null>(null);

  // Compare checkboxes
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

  const saveSnippets = (updated: SavedSnippetItem[]) => {
    setSnippets(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  };

  const handleAddCurrent = () => {
    if (!currentCode.trim()) return;
    const newItem: SavedSnippetItem = {
      id: `snip_${Date.now()}`,
      title: newTitle.trim() || `Saved ${newType.toUpperCase()} (${new Date().toLocaleDateString()})`,
      type: newType,
      dialect: currentDialect,
      code: currentCode.trim(),
      createdAt: new Date().toISOString(),
    };
    const updated = [newItem, ...snippets];
    saveSnippets(updated);
    setNewTitle('');
  };

  const handleDelete = (id: string) => {
    const updated = snippets.filter((s) => s.id !== id);
    saveSnippets(updated);
  };

  const handleShareSnapshot = (snippet: SavedSnippetItem) => {
    const payload = {
      title: snippet.title,
      dialect: snippet.dialect,
      code: snippet.code,
      type: snippet.type,
    };
    const encoded = encodeURIComponent(JSON.stringify(payload));
    const shareUrl = `${window.location.origin}/studio?snapshot=${encoded}`;
    navigator.clipboard.writeText(shareUrl);
    setSharedLink(shareUrl);
    setTimeout(() => setSharedLink(null), 3000);
  };

  const handleCompareClick = () => {
    if (selectedForCompare.length !== 2 || !onCompareSnapshots) return;
    const item1 = snippets.find((s) => s.id === selectedForCompare[0]);
    const item2 = snippets.find((s) => s.id === selectedForCompare[1]);
    if (item1 && item2) {
      onCompareSnapshots(item1.code, item2.code);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#141414]/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[#fbf9f5] border border-[#141414] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[#141414]/15 bg-[#efece6] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-[#141414]" />
            <h3 className="text-[15px] font-semibold text-[#141414]">
              Snippet &amp; Schema Library
            </h3>
            <span className="font-mono text-[10px] text-[#141414]/50">
              ({snippets.length} saved)
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#141414]/60 hover:text-[#141414] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Save Current Workspace Action */}
        {currentCode.trim() && (
          <div className="p-3.5 bg-[#f2eee6] border-b border-[#141414]/10 flex flex-wrap items-center gap-3">
            <span className="font-mono text-[11px] text-[#141414]/80 font-medium shrink-0">
              Save Active Workspace:
            </span>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. My Custom Analytics Query or DDL v1"
              className="h-8 px-2.5 bg-white border border-[#141414]/25 text-[12px] font-mono flex-1 min-w-[200px] focus:outline-none focus:border-[#141414]"
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as any)}
              className="h-8 px-2 bg-white border border-[#141414]/25 font-mono text-[11px] focus:outline-none"
            >
              <option value="query">SQL Query</option>
              <option value="cte">CTE Block</option>
              <option value="ddl">DDL Schema Snapshot</option>
            </select>
            <button
              type="button"
              onClick={handleAddCurrent}
              className="h-8 px-3 bg-[#141414] text-[#efece6] hover:bg-[#2a2928] font-mono-label text-[10.5px] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Save Snippet</span>
            </button>
          </div>
        )}

        {/* Share Feedback Toast */}
        {sharedLink && (
          <div className="p-2.5 bg-emerald-100 border-b border-emerald-300 text-emerald-900 text-[11.5px] font-mono flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-700" />
              <span>Shareable read-only snapshot link copied to clipboard!</span>
            </span>
          </div>
        )}

        {/* Snippets List */}
        <div className="flex-1 overflow-y-auto nova-scroll p-4 space-y-3">
          {snippets.length === 0 ? (
            <div className="py-12 text-center text-[#141414]/50 font-mono text-[12px]">
              No saved snippets yet. Save your queries, CTEs, or DDL versions above.
            </div>
          ) : (
            snippets.map((snip) => {
              const isCheckedForCompare = selectedForCompare.includes(snip.id);

              return (
                <div
                  key={snip.id}
                  className="p-3.5 border border-[#141414]/20 bg-white hover:border-[#141414]/40 transition-all flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {snip.type === 'ddl' && (
                        <input
                          type="checkbox"
                          checked={isCheckedForCompare}
                          onChange={(e) => {
                            if (e.target.checked) {
                              if (selectedForCompare.length < 2) {
                                setSelectedForCompare([...selectedForCompare, snip.id]);
                              }
                            } else {
                              setSelectedForCompare(selectedForCompare.filter((id) => id !== snip.id));
                            }
                          }}
                          className="w-3.5 h-3.5 rounded cursor-pointer"
                          title="Select 2 DDL versions to compare in Schema Diff"
                        />
                      )}
                      <span className="font-semibold text-[13px] text-[#141414] font-mono">
                        {snip.title}
                      </span>
                      <span className="px-1.5 py-0.5 text-[9px] font-mono border uppercase bg-[#f6f4ef] text-[#141414]/70">
                        {snip.type}
                      </span>
                      <span className="text-[10px] text-[#141414]/50 font-mono">
                        {snip.dialect.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleShareSnapshot(snip)}
                        className="p-1.5 border border-[#141414]/20 bg-[#efece6] hover:bg-[#141414] hover:text-[#efece6] font-mono text-[10px] inline-flex items-center gap-1 transition-colors cursor-pointer"
                        title="Copy read-only shareable link"
                      >
                        <Share2 className="w-3 h-3" />
                        <span className="hidden sm:inline">Share</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onLoadSnippet(snip.code, snip.dialect);
                          onClose();
                        }}
                        className="px-2.5 py-1 bg-[#141414] text-[#efece6] hover:bg-[#2a2928] font-mono-label text-[10px] inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <FileCode className="w-3 h-3" />
                        <span>Load</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(snip.id)}
                        className="p-1 text-[#141414]/40 hover:text-red-600 transition-colors cursor-pointer"
                        title="Delete snippet"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {snip.description && (
                    <p className="text-[11px] text-[#141414]/65">{snip.description}</p>
                  )}

                  <pre className="p-2.5 bg-[#19191c] text-[#f3f0ea] font-mono text-[11px] leading-[1.5] max-h-24 overflow-y-auto nova-scroll rounded-xs">
                    <code>{snip.code}</code>
                  </pre>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with Compare action */}
        <div className="p-3 border-t border-[#141414]/15 bg-[#efece6] flex items-center justify-between text-[11px] font-mono">
          <span className="text-[#141414]/70">
            {selectedForCompare.length === 2
              ? '2 DDL snapshots selected.'
              : 'Select any 2 DDL versions to compare in Schema Diff.'}
          </span>

          <button
            type="button"
            disabled={selectedForCompare.length !== 2}
            onClick={handleCompareClick}
            className="px-3 py-1.5 border border-[#141414] bg-[#141414] text-[#efece6] disabled:opacity-40 font-mono-label text-[10.5px] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span>Compare Selected in Schema Diff</span>
          </button>
        </div>
      </div>
    </div>
  );
};
