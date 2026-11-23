import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NovaStore,
  hashPassword,
  parseCookieHeader,
  signSessionToken,
  validateLoginInput,
  validateRegistrationInput,
  verifyPassword,
  verifySessionToken,
} from './authStore.ts';

test('password hashing verifies valid password and rejects wrong password', () => {
  const hash = hashPassword('supersecret99');
  assert.equal(verifyPassword('supersecret99', hash), true);
  assert.equal(verifyPassword('wrongpass', hash), false);
});

test('session token signing round-trips userId and rejects tampered tokens', () => {
  const secret = 'test-secret-key';
  const token = signSessionToken('usr_12345', secret);
  assert.equal(verifySessionToken(token, secret), 'usr_12345');
  assert.equal(verifySessionToken(`${token}x`, secret), null);
  assert.equal(verifySessionToken(token, 'other-secret'), null);
});

test('input validation catches invalid emails and short passwords', () => {
  assert.equal(validateRegistrationInput({ name: 'A', email: 'bad', password: '123' }).valid, false);
  assert.equal(
    validateRegistrationInput({ name: 'Ada Lovelace', email: 'ada@nova.dev', password: 'password123' }).valid,
    true
  );
  assert.equal(validateLoginInput({ email: 'ada@nova.dev', password: '' }).valid, false);
});

test('NovaStore registers, authenticates, and persists user chat sessions in memory', () => {
  const store = new NovaStore(null);
  const reg = store.registerUser({
    name: 'Mara Elling',
    email: 'mara@northline.io',
    password: 'password123',
  });
  assert.ok(reg.user);
  assert.equal(reg.user.email, 'mara@northline.io');

  // Duplicate email rejected
  const dup = store.registerUser({
    name: 'Mara 2',
    email: 'mara@northline.io',
    password: 'password123',
  });
  assert.ok(dup.error);

  // Login works
  const auth = store.authenticateUser({ email: 'mara@northline.io', password: 'password123' });
  assert.equal(auth.user?.id, reg.user.id);

  // Session CRUD + Rename works
  const session = store.createSession(reg.user.id, {
    title: 'Cohort SQL',
    mode: 'text-to-query',
    dialect: 'postgresql',
  });
  assert.equal(store.listSessions(reg.user.id).length, 1);
  const renamed = store.renameSession(reg.user.id, session.id, 'Q4 Cohort Retention');
  assert.equal(renamed?.title, 'Q4 Cohort Retention');
  assert.equal(store.deleteSession(reg.user.id, session.id), true);
  assert.equal(store.listSessions(reg.user.id).length, 0);

  // Change password verifies current password & rotates hash
  const badChange = store.changePassword(reg.user.id, 'wrong-old', 'newpass999');
  assert.equal(badChange.ok, false);
  const okChange = store.changePassword(reg.user.id, 'password123', 'newpass999');
  assert.equal(okChange.ok, true);
  assert.equal(
    store.authenticateUser({ email: 'mara@northline.io', password: 'newpass999' }).user?.id,
    reg.user.id
  );
});

test('parseCookieHeader extracts named cookies cleanly', () => {
  const parsed = parseCookieHeader('foo=bar; nova_session=abc.123; theme=paper');
  assert.equal(parsed.nova_session, 'abc.123');
  assert.equal(parsed.foo, 'bar');
});

test('NovaStore does not seed a demo account and supports OAuth user upsert', () => {
  const store = new NovaStore(null);
  const demoAttempt = store.authenticateUser({
    email: 'demo@novaagent.io',
    password: 'nova2026',
  });
  assert.equal(demoAttempt.user, undefined);
  assert.ok(demoAttempt.error);

  const oauthUser = store.upsertOAuthUser({
    provider: 'google',
    name: 'Nadia Patel',
    email: 'nadia@example.com',
  });
  assert.equal(oauthUser.email, 'nadia@example.com');
  const again = store.upsertOAuthUser({
    provider: 'google',
    name: 'Nadia Patel',
    email: 'nadia@example.com',
  });
  assert.equal(again.id, oauthUser.id);
});
