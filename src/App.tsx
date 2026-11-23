import { useCallback, useEffect, useState } from 'react';
import { AccountModal } from './components/AccountModal';
import { AuthModal } from './components/AuthModal';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { LandingPage } from './components/LandingPage';
import { LegalPage } from './components/LegalPages';
import { NotFoundPage } from './components/NotFoundPage';
import { NovaStudio } from './components/NovaStudio';
import type { AuthUser, ChatSession, NovaMode, SqlDialect } from './types/nova';
import {
  readCookieConsent,
  saveCookieConsent,
  trackAnalyticsEvent,
  type CookieConsentState,
} from './utils/analytics';
import { applyDocumentSeo, resolveRouteFromPath } from './utils/seo';

const GUEST_STORAGE_KEY = 'nova_guest_sessions_v2';

function loadGuestSessions(): ChatSession[] {
  try {
    const raw = window.localStorage.getItem(GUEST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ChatSession[];
      if (Array.isArray(parsed)) {
        return parsed.filter((s) => s && !String(s.id).startsWith('demo-'));
      }
    }
  } catch {
    // Ignore storage errors
  }
  return [];
}


export default function App() {
  const [locationState, setLocationState] = useState<{ pathname: string; search: string }>(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }));

  const route = resolveRouteFromPath(locationState.pathname, locationState.search);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | undefined>(undefined);
  const [showAccountModal, setShowAccountModal] = useState(false);

  const [cookieConsent, setCookieConsent] = useState<CookieConsentState | null>(() =>
    readCookieConsent()
  );
  const [cookieModalOpen, setCookieModalOpen] = useState(false);

  const [sessions, setSessions] = useState<ChatSession[]>(() => loadGuestSessions());
  const [activeSessionId, setActiveSessionId] = useState<string>(
    () => loadGuestSessions()[0]?.id ?? ''
  );

  const [studioLaunchMode, setStudioLaunchMode] = useState<NovaMode | undefined>(undefined);
  const [studioLaunchPrompt, setStudioLaunchPrompt] = useState<string | undefined>(undefined);

  const navigate = useCallback((path: string) => {
    const target = path.startsWith('/') ? path : `/${path}`;
    const [rawPath, hashPart] = target.split('#');
    const [pathname, searchPart] = (rawPath || '/').split('?');
    const search = searchPart ? `?${searchPart}` : '';
    const fullUrl = `${pathname || '/'}${search}${hashPart ? `#${hashPart}` : ''}`;

    if (window.location.pathname !== pathname || window.location.search !== search) {
      window.history.pushState({}, '', fullUrl);
      setLocationState({ pathname: pathname || '/', search });
    }

    if (hashPart) {
      window.setTimeout(() => {
        document.getElementById(hashPart)?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    } else {
      window.scrollTo({ top: 0 });
    }
  }, []);

  // Sync browser Back/Forward navigation
  useEffect(() => {
    const onPopState = () => {
      setLocationState({
        pathname: window.location.pathname,
        search: window.location.search,
      });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Dynamic SEO metadata + consent-gated page view analytics per route
  useEffect(() => {
    applyDocumentSeo(route, window.location.origin, locationState.pathname);
    trackAnalyticsEvent('page_view', { route });
  }, [route, locationState.pathname]);

  // Persist guest sessions locally whenever not signed in
  useEffect(() => {
    if (!user) {
      try {
        window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(sessions));
      } catch {
        // Ignore quota errors
      }
    }
  }, [sessions, user]);

  const loadUserSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      if (!res.ok) return;
      const data = await res.json();
      const loaded: ChatSession[] = Array.isArray(data.sessions) ? data.sessions : [];
      setSessions(loaded);
      setActiveSessionId(loaded[0]?.id ?? '');
    } catch {
      // Ignore
    }
  }, []);

  // Hydrate authenticated session on mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        if (data.user) {
          setUser(data.user);
          await loadUserSessions();
        }
      } catch {
        // Offline or dev restart
      }
    })();
    return () => {
      active = false;
    };
  }, [loadUserSessions]);

  const handleOpenAuth = useCallback((mode: 'login' | 'register' = 'login', prompt?: string) => {
    if (prompt !== undefined) {
      setPendingPrompt(prompt);
    }
    setAuthModalMode(mode);
  }, []);

  const handleOpenStudio = (opts?: { mode?: NovaMode; prompt?: string }) => {
    if (opts?.mode) setStudioLaunchMode(opts.mode);

    // Enforce login-before-prompt if a prompt is passed while signed out
    if (opts?.prompt && !user) {
      setPendingPrompt(opts.prompt);
      setAuthModalMode('login');
      return;
    }

    if (opts?.prompt) {
      setStudioLaunchPrompt(opts.prompt);
      const now = new Date().toISOString();
      const fresh: ChatSession = {
        id: `local_${Date.now()}`,
        title: opts.prompt.slice(0, 38),
        mode: opts.mode || 'text-to-query',
        dialect: 'postgresql',
        schemaContext: '',
        messages: [],
        createdAt: now,
        updatedAt: now,
      };
      setSessions((prev) => [fresh, ...prev]);
      setActiveSessionId(fresh.id);
    }
    navigate('/studio');
  };

  const handleCreateSession = async (mode: NovaMode, dialect: SqlDialect) => {
    setStudioLaunchMode(mode);
    setStudioLaunchPrompt('');
    if (user) {
      try {
        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'New Query', mode, dialect }),
        });
        if (res.ok) {
          const data = await res.json();
          setSessions((prev) => [data.session, ...prev]);
          setActiveSessionId(data.session.id);
          return;
        }
      } catch {
        // Fall through to local
      }
    }
    const now = new Date().toISOString();
    const localSession: ChatSession = {
      id: `local_${Date.now()}`,
      title: 'New Query',
      mode,
      dialect,
      schemaContext: '',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    setSessions((prev) => [localSession, ...prev]);
    setActiveSessionId(localSession.id);
  };

  const handleRenameSession = async (id: string, newTitle: string) => {
    const clean = newTitle.trim();
    if (!clean) return;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, title: clean, updatedAt: new Date().toISOString() } : s
      )
    );
    if (user && !id.startsWith('local_')) {
      try {
        await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: clean }),
        });
      } catch {
        // Ignore network hiccup
      }
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (user && !id.startsWith('local_')) {
      try {
        await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch {
        // Ignore
      }
    }
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== id);
      if (activeSessionId === id) {
        setActiveSessionId(remaining[0]?.id ?? '');
      }
      return remaining;
    });
  };

  const handleClearAllSessions = async () => {
    if (user) {
      try {
        await fetch('/api/sessions', { method: 'DELETE' });
      } catch {
        // Ignore
      }
    } else {
      try {
        window.localStorage.removeItem(GUEST_STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
    setSessions([]);
    setActiveSessionId('');
  };

  const handleUpdateSession = (updated: ChatSession) => {
    setSessions((prev) => {
      const exists = prev.some((s) => s.id === updated.id);
      if (exists) {
        return prev.map((s) => (s.id === updated.id ? updated : s));
      }
      const filtered = prev.filter((s) => s.id !== activeSessionId || s.messages.length > 0);
      return [updated, ...filtered];
    });
    setActiveSessionId(updated.id);
  };

  const handleAuthSuccess = async (authedUser: AuthUser) => {
    setUser(authedUser);
    setAuthModalMode(null);
    trackAnalyticsEvent('auth_success');
    await loadUserSessions();
    if (pendingPrompt) {
      setStudioLaunchPrompt(pendingPrompt);
      setPendingPrompt(undefined);
    }
    navigate('/studio');
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore
    }
    setUser(null);
    setShowAccountModal(false);
    const guestList = loadGuestSessions();
    setSessions(guestList);
    setActiveSessionId(guestList[0]?.id ?? '');
  };

  const handleSaveCookieConsent = (analyticsEnabled: boolean) => {
    const saved = saveCookieConsent(analyticsEnabled);
    setCookieConsent(saved);
    if (analyticsEnabled) {
      trackAnalyticsEvent('consent_opt_in', { route });
    }
  };

  const savedBackendCount = user
    ? sessions.filter((s) => !s.id.startsWith('local_')).length
    : 0;

  return (
    <>
      {/* Keyboard Accessibility Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:px-3.5 focus:py-2 focus:bg-[#141414] focus:text-[#efece6] focus:border focus:border-[#efece6] font-mono-label text-[11px]"
      >
        Skip to main content
      </a>

      {route === 'landing' && (
        <LandingPage
          user={user}
          onOpenStudio={handleOpenStudio}
          onOpenAuth={handleOpenAuth}
          onLogout={handleLogout}
          onNavigate={navigate}
          onOpenCookieSettings={() => setCookieModalOpen(true)}
        />
      )}

      {route === 'studio' && (
        <NovaStudio
          user={user}
          sessions={sessions}
          activeSessionId={activeSessionId}
          initialMode={studioLaunchMode}
          initialPrompt={studioLaunchPrompt}
          onSelectSession={(id) => {
            setStudioLaunchMode(undefined);
            setStudioLaunchPrompt(undefined);
            setActiveSessionId(id);
          }}
          onCreateSession={handleCreateSession}
          onRenameSession={handleRenameSession}
          onDeleteSession={handleDeleteSession}
          onClearAllSessions={handleClearAllSessions}
          onUpdateSession={handleUpdateSession}
          onBackToLanding={() => navigate('/')}
          onOpenAuth={handleOpenAuth}
          onOpenAccount={() => setShowAccountModal(true)}
          onLogout={handleLogout}
        />
      )}

      {(route === 'privacy' || route === 'terms') && (
        <LegalPage
          kind={route}
          onNavigate={navigate}
          onOpenCookieSettings={() => setCookieModalOpen(true)}
        />
      )}

      {route === 'not-found' && (
        <NotFoundPage attemptedPath={locationState.pathname} onNavigate={navigate} />
      )}

      <CookieConsentBanner
        consent={cookieConsent}
        forceOpen={cookieModalOpen}
        onSave={handleSaveCookieConsent}
        onCloseForceOpen={() => setCookieModalOpen(false)}
        onNavigate={navigate}
      />

      {authModalMode && (
        <AuthModal
          initialMode={authModalMode}
          onClose={() => {
            setAuthModalMode(null);
            setPendingPrompt(undefined);
          }}
          onSuccess={handleAuthSuccess}
        />
      )}

      {showAccountModal && user && (
        <AccountModal
          user={user}
          savedCount={savedBackendCount}
          onClose={() => setShowAccountModal(false)}
          onLogout={handleLogout}
        />
      )}
    </>
  );
}
