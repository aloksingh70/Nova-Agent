export interface CookieConsentState {
  essential: true;
  analytics: boolean;
  updatedAt: string;
}

export interface AnalyticsEvent {
  name: string;
  path: string;
  metadata?: Record<string, string | number | boolean>;
  timestamp: string;
}

const CONSENT_STORAGE_KEY = 'nova_cookie_consent_v1';

export function readCookieConsent(storage?: Pick<Storage, 'getItem'>): CookieConsentState | null {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return null;
    const raw = store.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookieConsentState>;
    if (typeof parsed.analytics !== 'boolean') return null;
    return {
      essential: true,
      analytics: parsed.analytics,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveCookieConsent(
  analytics: boolean,
  storage?: Pick<Storage, 'setItem'>
): CookieConsentState {
  const state: CookieConsentState = {
    essential: true,
    analytics,
    updatedAt: new Date().toISOString(),
  };
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    store?.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
  return state;
}

export function shouldRecordAnalytics(consent: CookieConsentState | null): boolean {
  return Boolean(consent && consent.analytics === true);
}

/**
 * Privacy-first, consent-gated analytics tracker.
 * Only sends aggregate, non-PII product events when the user has opted into analytics cookies.
 */
export function trackAnalyticsEvent(
  name: string,
  metadata?: Record<string, string | number | boolean>
): boolean {
  const consent = readCookieConsent();
  if (!shouldRecordAnalytics(consent)) return false;

  const payload: AnalyticsEvent = {
    name,
    path: typeof window !== 'undefined' ? window.location.pathname : '/',
    metadata,
    timestamp: new Date().toISOString(),
  };

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon('/api/analytics', blob);
      return true;
    } catch {
      // Fall back to fetch
    }
  }

  if (typeof fetch === 'function') {
    void fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Non-blocking telemetry
    });
  }
  return true;
}
