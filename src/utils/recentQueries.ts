const MAX_RECENT_QUERIES = 10;
const GLOBAL_STORAGE_KEY = 'nova_recent_queries_global';

export interface RecentQueryItem {
  id: string;
  sql: string;
  dialect?: string;
  timestamp: string;
  summary?: string;
}

function getStorageKey(sessionId?: string): string {
  if (sessionId && !sessionId.startsWith('local_')) {
    return `nova_recent_queries_${sessionId}`;
  }
  return GLOBAL_STORAGE_KEY;
}

/**
 * Retrieves the last 10 successful SQL queries from localStorage.
 */
export function getRecentQueries(sessionId?: string): RecentQueryItem[] {
  try {
    const key = getStorageKey(sessionId);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, MAX_RECENT_QUERIES);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Caches a new successful query in localStorage, deduplicating and keeping at most 10 items.
 */
export function addRecentQuery(
  sql: string,
  opts?: { sessionId?: string; dialect?: string; summary?: string }
): RecentQueryItem[] {
  const cleanSql = (sql || '').trim();
  if (!cleanSql || cleanSql.length < 6) return getRecentQueries(opts?.sessionId);

  try {
    const current = getRecentQueries(opts?.sessionId);
    // Remove duplicate of the same query if already present
    const filtered = current.filter((item) => item.sql.trim() !== cleanSql);

    const newItem: RecentQueryItem = {
      id: `rq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sql: cleanSql,
      dialect: opts?.dialect,
      timestamp: new Date().toISOString(),
      summary: opts?.summary,
    };

    const updated = [newItem, ...filtered].slice(0, MAX_RECENT_QUERIES);

    // Save per-session
    const sessionKey = getStorageKey(opts?.sessionId);
    localStorage.setItem(sessionKey, JSON.stringify(updated));

    // Also update global cache if session was provided
    if (sessionKey !== GLOBAL_STORAGE_KEY) {
      const globalCurrent = getRecentQueries();
      const globalFiltered = globalCurrent.filter((item) => item.sql.trim() !== cleanSql);
      const globalUpdated = [newItem, ...globalFiltered].slice(0, MAX_RECENT_QUERIES);
      localStorage.setItem(GLOBAL_STORAGE_KEY, JSON.stringify(globalUpdated));
    }

    return updated;
  } catch {
    return [];
  }
}

/**
 * Clears cached recent queries.
 */
export function clearRecentQueries(sessionId?: string): void {
  try {
    localStorage.removeItem(getStorageKey(sessionId));
    if (sessionId) {
      localStorage.removeItem(GLOBAL_STORAGE_KEY);
    }
  } catch {}
}
