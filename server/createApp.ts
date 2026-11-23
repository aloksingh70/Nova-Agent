import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import {
  NovaStore,
  parseCookieHeader,
  signSessionToken,
  verifySessionToken,
} from './authStore';
import {
  buildOAuthAuthorizationUrl,
  buildSessionCookieHeader,
  getOAuthProviderConfig,
  isOAuthProvider,
  listOAuthProviderStatuses,
  resolveAppOrigin,
  signOAuthState,
  verifyOAuthState,
} from './oauthProviders';
import { generateNovaResponse } from './geminiService';
import type { ChatMessage, NovaMode, SqlDialect } from '../src/types/nova';

const SESSION_COOKIE = 'nova_session';
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(process.env.APP_URL || 'nova-agent-local-secret-2026').digest('hex');

const VALID_MODES = new Set<NovaMode>([
  'text-to-query',
  'er-diagram',
  'optimize',
  'debug',
  'schema-builder',
  'explain',
  'convert',
]);

const VALID_DIALECTS = new Set<SqlDialect>([
  'postgresql',
  'mysql',
  'sqlite',
  'sqlserver',
  'bigquery',
  'mongodb',
]);

const store = new NovaStore();

function isSecureOrigin(req: express.Request): boolean {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '');
  const appUrl = (process.env.APP_URL || '').trim();
  return (
    process.env.NODE_ENV === 'production' ||
    forwardedProto.includes('https') ||
    req.protocol === 'https' ||
    appUrl.startsWith('https://')
  );
}

function setAuthCookie(req: express.Request, res: express.Response, token: string): void {
  res.setHeader(
    'Set-Cookie',
    buildSessionCookieHeader(SESSION_COOKIE, token, {
      secure: isSecureOrigin(req),
      maxAgeSeconds: 604800,
    })
  );
}

function clearAuthCookie(req: express.Request, res: express.Response): void {
  res.setHeader(
    'Set-Cookie',
    buildSessionCookieHeader(SESSION_COOKIE, '', {
      secure: isSecureOrigin(req),
      maxAgeSeconds: 0,
    })
  );
}

function getAuthenticatedUserId(req: express.Request): string | null {
  const cookies = parseCookieHeader(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  return verifySessionToken(token, SESSION_SECRET);
}

export async function createApp(opts?: { isServerless?: boolean }): Promise<express.Express> {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // SEO: dynamic robots.txt
  app.get('/robots.txt', (req, res) => {
    const origin = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /api/',
        'Disallow: /auth/',
        '',
        `Sitemap: ${origin}/sitemap.xml`,
      ].join('\n')
    );
  });

  // SEO: dynamic sitemap.xml
  app.get('/sitemap.xml', (req, res) => {
    const origin = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const today = new Date().toISOString().slice(0, 10);
    const urls = [
      { loc: '/', changefreq: 'weekly', priority: '1.0' },
      { loc: '/studio', changefreq: 'weekly', priority: '0.9' },
      { loc: '/privacy', changefreq: 'monthly', priority: '0.4' },
      { loc: '/terms', changefreq: 'monthly', priority: '0.4' },
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${origin}${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  });

  // Privacy-first aggregate analytics endpoint (consent-gated client-side, no PII stored)
  const analyticsCounts: Record<string, number> = {};
  app.post('/api/analytics', (req, res) => {
    const eventName = typeof req.body?.name === 'string' ? req.body.name.slice(0, 64) : '';
    if (!eventName) {
      res.status(400).json({ error: 'Event name required.' });
      return;
    }
    analyticsCounts[eventName] = (analyticsCounts[eventName] ?? 0) + 1;
    res.status(200).json({ ok: true });
  });

  // Contact / Support inquiry form endpoint
  app.post('/api/contact', (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

    if (name.length < 2) {
      res.status(400).json({ error: 'Please enter your name (at least 2 characters).' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (message.length < 10) {
      res.status(400).json({ error: 'Message must be at least 10 characters.' });
      return;
    }

    res.status(201).json({
      ok: true,
      message: `Thanks ${name}, your inquiry has been received. We will reply to ${email}.`,
    });
  });

  // Auth: current user
  app.get('/api/auth/me', (req, res) => {
    const uid = getAuthenticatedUserId(req);
    if (!uid) {
      res.json({ user: null });
      return;
    }
    const user = store.getUserById(uid);
    res.json({ user });
  });

  // Auth: register with email & password (manual sign up)
  app.post('/api/auth/register', (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    const email = typeof req.body?.email === 'string' ? req.body.email : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    const result = store.registerUser({ name, email, password });
    if (!result.user) {
      res.status(400).json({ error: result.error || 'Registration failed.' });
      return;
    }

    const sessionToken = signSessionToken(result.user.id, SESSION_SECRET);
    setAuthCookie(req, res, sessionToken);
    res.status(201).json({ user: result.user });
  });

  // Auth: login with email & password (manual sign in)
  app.post('/api/auth/login', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    const result = store.authenticateUser({ email, password });
    if (!result.user) {
      res.status(401).json({ error: result.error || 'Invalid email or password.' });
      return;
    }

    const sessionToken = signSessionToken(result.user.id, SESSION_SECRET);
    setAuthCookie(req, res, sessionToken);
    res.status(200).json({ user: result.user });
  });

  // Auth: change password for signed-in user
  app.post('/api/auth/password', (req, res) => {
    const uid = getAuthenticatedUserId(req);
    if (!uid) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    const result = store.changePassword(uid, currentPassword, newPassword);
    if (!result.ok) {
      res.status(400).json({ error: result.error || 'Password update failed.' });
      return;
    }
    res.json({ ok: true, message: 'Password updated successfully.' });
  });

  // Auth: logout
  app.post('/api/auth/logout', (req, res) => {
    clearAuthCookie(req, res);
    res.json({ ok: true });
  });

  // Auth: list OAuth provider configuration status (non-sensitive metadata only)
  app.get('/api/auth/providers', (req, res) => {
    const appOrigin = resolveAppOrigin(
      process.env.APP_URL,
      String(req.headers['x-forwarded-proto'] || req.protocol || 'http'),
      req.get('host')
    );
    res.json({
      providers: listOAuthProviderStatuses(process.env, appOrigin),
    });
  });

  // Auth: OAuth provider authorization URL (Google, GitHub, Microsoft)
  app.get('/api/auth/oauth/:provider/url', (req, res) => {
    const rawProvider = String(req.params.provider || '').toLowerCase();
    if (!isOAuthProvider(rawProvider)) {
      res.status(400).json({ error: 'Unsupported OAuth provider.' });
      return;
    }

    const appOrigin = resolveAppOrigin(
      process.env.APP_URL,
      String(req.headers['x-forwarded-proto'] || req.protocol || 'http'),
      req.get('host')
    );
    const cfg = getOAuthProviderConfig(rawProvider, process.env, appOrigin);

    if (!cfg.clientId || !cfg.clientSecret) {
      res.status(200).json({
        configured: false,
        url: null,
        error: `${cfg.name} sign-in requires ${cfg.envVars.join(' and ')} to be configured in your environment variables.`,
        redirectUri: cfg.redirectUri,
        envVars: cfg.envVars,
        provider: cfg.id,
      });
      return;
    }

    const state = signOAuthState(cfg.id, SESSION_SECRET);
    const url = buildOAuthAuthorizationUrl(cfg, state);
    res.json({ configured: true, url, provider: cfg.id });
  });

  // Auth: OAuth provider callback (handles trailing slash variations)
  app.get(['/auth/callback/:provider', '/auth/callback/:provider/'], async (req, res) => {
    const rawProvider = String(req.params.provider || '').toLowerCase();
    const providerError =
      typeof req.query.error_description === 'string'
        ? req.query.error_description
        : typeof req.query.error === 'string'
          ? req.query.error
          : '';

    const sendPopupError = (status: number, message: string) => {
      res.status(status).send(`<!doctype html>
<html><body style="font-family:sans-serif;padding:24px;background:#efece6;color:#141414;">
  <p>${message.replace(/</g, '&lt;')}</p>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: ${JSON.stringify(message)} }, '*');
      window.close();
    }
  </script>
</body></html>`);
    };

    if (!isOAuthProvider(rawProvider)) {
      sendPopupError(400, 'Unsupported OAuth provider.');
      return;
    }

    if (providerError) {
      sendPopupError(400, `Authorization cancelled: ${providerError}`);
      return;
    }

    const appOrigin = resolveAppOrigin(
      process.env.APP_URL,
      String(req.headers['x-forwarded-proto'] || req.protocol || 'http'),
      req.get('host')
    );
    const cfg = getOAuthProviderConfig(rawProvider, process.env, appOrigin);
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    if (!cfg.clientId || !cfg.clientSecret) {
      sendPopupError(500, `${cfg.name} OAuth credentials are not configured on the server.`);
      return;
    }

    if (!code || !verifyOAuthState(state, cfg.id, SESSION_SECRET)) {
      sendPopupError(400, 'Invalid or expired OAuth state. Please try signing in again.');
      return;
    }

    try {
      const tokenBody = new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        redirect_uri: cfg.redirectUri,
        grant_type: 'authorization_code',
      });

      const tokenRes = await fetch(cfg.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: tokenBody.toString(),
      });

      const tokenJson = (await tokenRes.json()) as {
        access_token?: string;
        error?: string;
        error_description?: string;
      };
      if (!tokenRes.ok || !tokenJson.access_token) {
        throw new Error(
          tokenJson.error_description ||
            tokenJson.error ||
            `${cfg.name} did not return an access token.`
        );
      }

      const profRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      const prof = (await profRes.json()) as { name?: string; email?: string };
      const name = prof.name || '';
      const email = prof.email || '';

      if (!email) {
        throw new Error('Could not read a verified email address from Google.');
      }

      const user = store.upsertOAuthUser({ provider: 'google', name, email });
      const sessionToken = signSessionToken(user.id, SESSION_SECRET);
      setAuthCookie(req, res, sessionToken);

      res.send(`<!doctype html>
<html><body style="font-family:sans-serif;padding:24px;background:#efece6;color:#141414;">
  <p>Authentication successful. Returning to NOVA AGENT...</p>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: ${JSON.stringify(cfg.id)} }, '*');
      window.close();
    } else {
      window.location.href = '/studio';
    }
  </script>
</body></html>`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `${cfg.name} OAuth login failed.`;
      sendPopupError(500, msg);
    }
  });

  // Sessions: list for signed-in user
  app.get('/api/sessions', (req, res) => {
    const uid = getAuthenticatedUserId(req);
    if (!uid) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    res.json({ sessions: store.listSessions(uid) });
  });

  // Sessions: create
  app.post('/api/sessions', (req, res) => {
    const uid = getAuthenticatedUserId(req);
    if (!uid) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const mode: NovaMode = VALID_MODES.has(req.body?.mode) ? req.body.mode : 'text-to-query';
    const dialect: SqlDialect = VALID_DIALECTS.has(req.body?.dialect)
      ? req.body.dialect
      : 'postgresql';
    const session = store.createSession(uid, {
      title: typeof req.body?.title === 'string' ? req.body.title : 'New Query',
      mode,
      dialect,
      schemaContext: typeof req.body?.schemaContext === 'string' ? req.body.schemaContext : '',
    });
    res.status(201).json({ session });
  });

  // Sessions: rename
  app.patch('/api/sessions/:id', (req, res) => {
    const uid = getAuthenticatedUserId(req);
    if (!uid) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const title = typeof req.body?.title === 'string' ? req.body.title : '';
    const updated = store.renameSession(uid, req.params.id, title);
    if (!updated) {
      res.status(400).json({ error: 'Could not rename session.' });
      return;
    }
    res.json({ session: updated });
  });

  // Sessions: clear all for signed-in user
  app.delete('/api/sessions', (req, res) => {
    const uid = getAuthenticatedUserId(req);
    if (!uid) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const current = store.listSessions(uid);
    for (const s of current) {
      store.deleteSession(uid, s.id);
    }
    res.json({ ok: true });
  });

  // Sessions: delete
  app.delete('/api/sessions/:id', (req, res) => {
    const uid = getAuthenticatedUserId(req);
    if (!uid) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const deleted = store.deleteSession(uid, req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // AI Chat endpoint (requires signed-in user)
  app.post('/api/chat', async (req, res) => {
    const uid = getAuthenticatedUserId(req);
    if (!uid) {
      res.status(401).json({ error: 'Please sign in before submitting a prompt to NOVA AGENT.' });
      return;
    }

    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const mode: NovaMode = VALID_MODES.has(req.body?.mode) ? req.body.mode : 'text-to-query';
    const dialect: SqlDialect = VALID_DIALECTS.has(req.body?.dialect)
      ? req.body.dialect
      : 'postgresql';
    const schemaContext =
      typeof req.body?.schemaContext === 'string' ? req.body.schemaContext : '';
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined;
    const history = Array.isArray(req.body?.history) ? req.body.history : [];

    if (!prompt) {
      res.status(400).json({ error: 'Please enter a query, schema description, or question.' });
      return;
    }

    try {
      const payload = await generateNovaResponse({
        prompt,
        mode,
        dialect,
        schemaContext,
        history,
      });

      const now = new Date().toISOString();
      const userMessage: ChatMessage = {
        id: `msg_${crypto.randomUUID().slice(0, 10)}`,
        role: 'user',
        mode,
        dialect,
        content: prompt,
        createdAt: now,
      };
      const assistantMessage: ChatMessage = {
        id: `msg_${crypto.randomUUID().slice(0, 10)}`,
        role: 'assistant',
        mode,
        dialect,
        content: payload.summary,
        payload,
        createdAt: new Date().toISOString(),
      };

      let persistedSession = null;

      const derivedTitle = prompt.length > 42 ? `${prompt.slice(0, 42).trim()}…` : prompt;
      if (sessionId) {
        persistedSession = store.appendMessages(uid, sessionId, [userMessage, assistantMessage], {
          mode,
          dialect,
          schemaContext,
        });
      }
      if (!persistedSession) {
        const created = store.createSession(uid, {
          title: derivedTitle,
          mode,
          dialect,
          schemaContext,
        });
        persistedSession = store.appendMessages(uid, created.id, [userMessage, assistantMessage]);
      }

      res.json({
        userMessage,
        assistantMessage,
        session: persistedSession,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unable to reach Gemini right now. Please try again.';
      const status =
        message.includes('API_KEY_INVALID') || message.includes('PERMISSION_DENIED')
          ? 403
          : message.includes('RESOURCE_EXHAUSTED')
            ? 429
            : 500;
      res.status(status).json({ error: message });
    }
  });

  // In serverless environments, static assets and SPA rewrites are served by Vercel CDN directly.
  if (!opts?.isServerless) {
    if (process.env.NODE_ENV !== 'production') {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.resolve(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  return app;
}
