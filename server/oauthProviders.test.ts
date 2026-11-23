import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOAuthAuthorizationUrl,
  buildSessionCookieHeader,
  getOAuthProviderConfig,
  isOAuthProvider,
  listOAuthProviderStatuses,
  resolveAppOrigin,
  signOAuthState,
  verifyOAuthState,
} from './oauthProviders.ts';

test('resolveAppOrigin prioritizes APP_URL and trims trailing slashes', () => {
  assert.equal(
    resolveAppOrigin('https://ais-dev-example.run.app/', 'http', 'localhost:3000'),
    'https://ais-dev-example.run.app'
  );
  assert.equal(
    resolveAppOrigin('', 'https', 'preview.example.com'),
    'https://preview.example.com'
  );
});

test('Google-only OAuth config reads GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and rejects other providers', () => {
  assert.equal(isOAuthProvider('google'), true);
  assert.equal(isOAuthProvider('github'), false);
  assert.equal(isOAuthProvider('microsoft'), false);

  const configuredStatuses = listOAuthProviderStatuses(
    { GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-sec' },
    'https://app.run.app'
  );
  assert.equal(configuredStatuses.length, 1);
  assert.deepEqual(configuredStatuses[0], {
    id: 'google',
    name: 'Google',
    configured: true,
    callbackUrl: 'https://app.run.app/auth/callback/google',
    envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  });

  const cfg = getOAuthProviderConfig(
    'google',
    { GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-sec' },
    'https://app.run.app'
  );
  const authUrl = new URL(buildOAuthAuthorizationUrl(cfg, 'state123'));
  assert.equal(authUrl.origin, 'https://accounts.google.com');
  assert.equal(authUrl.searchParams.get('client_id'), 'g-id');
  assert.equal(authUrl.searchParams.get('redirect_uri'), 'https://app.run.app/auth/callback/google');
  assert.equal(authUrl.searchParams.get('state'), 'state123');
});

test('signOAuthState and verifyOAuthState bind state to Google, secret, and expiry', () => {
  const secret = 'oauth-test-secret';
  const state = signOAuthState('google', secret, 60_000);

  assert.equal(verifyOAuthState(state, 'google', secret), true);
  assert.equal(verifyOAuthState(state, 'google', 'wrong-secret'), false);
  assert.equal(verifyOAuthState(`${state}x`, 'google', secret), false);

  const expired = signOAuthState('google', secret, -1000);
  assert.equal(verifyOAuthState(expired, 'google', secret), false);
});

test('buildSessionCookieHeader emits SameSite=None; Secure for HTTPS iframe contexts', () => {
  const secureHeader = buildSessionCookieHeader('nova_session', 'tok.123', {
    secure: true,
    maxAgeSeconds: 604800,
  });
  assert.match(secureHeader, /HttpOnly/);
  assert.match(secureHeader, /SameSite=None; Secure/);

  const localHeader = buildSessionCookieHeader('nova_session', 'tok.123', {
    secure: false,
    maxAgeSeconds: 604800,
  });
  assert.match(localHeader, /HttpOnly/);
  assert.match(localHeader, /SameSite=Lax/);
});
