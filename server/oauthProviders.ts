import crypto from 'node:crypto';

export type OAuthProviderId = 'google';

export interface OAuthProviderConfig {
  id: OAuthProviderId;
  name: string;
  clientId: string;
  clientSecret: string;
  envVars: [string, string];
  authUrl: string;
  tokenUrl: string;
  scope: string;
  redirectUri: string;
}

export interface OAuthProviderStatus {
  id: OAuthProviderId;
  name: string;
  configured: boolean;
  callbackUrl: string;
  envVars: [string, string];
}

export const OAUTH_PROVIDERS: readonly OAuthProviderId[] = ['google'];

export function isOAuthProvider(value: string): value is OAuthProviderId {
  return value === 'google';
}

/**
 * Resolves the canonical application origin.
 * Always prefers APP_URL when provided (required in AI Studio / Cloud Run behind proxies).
 */
export function resolveAppOrigin(
  envAppUrl: string | undefined,
  reqProto: string,
  reqHost: string | undefined
): string {
  const fromEnv = (envAppUrl || '').trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, '');
  }
  const proto = (reqProto || 'http').split(',')[0].trim() || 'http';
  const host = (reqHost || 'localhost:3000').trim();
  return `${proto}://${host}`.replace(/\/+$/, '');
}

/**
 * Reads Google OAuth client configuration from GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
 */
export function getOAuthProviderConfig(
  _provider: OAuthProviderId,
  env: Record<string, string | undefined>,
  appOrigin: string
): OAuthProviderConfig {
  const cleanOrigin = appOrigin.replace(/\/+$/, '');
  return {
    id: 'google',
    name: 'Google',
    clientId: (env.GOOGLE_CLIENT_ID || '').trim(),
    clientSecret: (env.GOOGLE_CLIENT_SECRET || '').trim(),
    envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    redirectUri: `${cleanOrigin}/auth/callback/google`,
  };
}

/**
 * Returns non-sensitive status metadata for Google OAuth.
 */
export function listOAuthProviderStatuses(
  env: Record<string, string | undefined>,
  appOrigin: string
): OAuthProviderStatus[] {
  return OAUTH_PROVIDERS.map((id) => {
    const cfg = getOAuthProviderConfig(id, env, appOrigin);
    return {
      id: cfg.id,
      name: cfg.name,
      configured: Boolean(cfg.clientId && cfg.clientSecret),
      callbackUrl: cfg.redirectUri,
      envVars: cfg.envVars,
    };
  });
}

/**
 * Generates an HMAC-signed, time-bound OAuth CSRF state parameter bound to Google.
 */
export function signOAuthState(
  provider: OAuthProviderId,
  secret: string,
  ttlMs = 10 * 60 * 1000
): string {
  const payload = Buffer.from(
    JSON.stringify({
      p: provider,
      n: crypto.randomBytes(12).toString('hex'),
      exp: Date.now() + ttlMs,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/**
 * Validates an OAuth state parameter against HMAC signature, provider match, and expiry.
 */
export function verifyOAuthState(
  state: string,
  expectedProvider: OAuthProviderId,
  secret: string
): boolean {
  if (!state || !state.includes('.')) return false;
  const [payload, sig] = state.split('.');
  if (!payload || !sig) return false;

  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      p?: string;
      exp?: number;
    };
    if (decoded.p !== expectedProvider) return false;
    if (!decoded.exp || Date.now() > decoded.exp) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds the external Google OAuth 2.0 authorization URL to open directly in a popup.
 */
export function buildOAuthAuthorizationUrl(cfg: OAuthProviderConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: cfg.scope,
    state,
    access_type: 'online',
    prompt: 'select_account',
  });

  return `${cfg.authUrl}?${params.toString()}`;
}

/**
 * Formats an HttpOnly session cookie header with SameSite=None; Secure for iframe HTTPS origins.
 */
export function buildSessionCookieHeader(
  cookieName: string,
  token: string,
  opts: { secure: boolean; maxAgeSeconds: number }
): string {
  const attrs = [
    `${cookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${opts.maxAgeSeconds}`,
    opts.secure ? 'SameSite=None; Secure' : 'SameSite=Lax',
  ];
  return attrs.join('; ');
}
