import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NovaStore,
  signSessionToken,
  verifySessionToken,
} from './authStore.ts';

test('Manual Auth: registration, login and session token verification', () => {
  const store = new NovaStore(null);
  const secret = 'super-secret-nova-key';

  // 1. Validation failures
  const shortPass = store.registerUser({
    name: 'John Doe',
    email: 'john@example.com',
    password: '123',
  });
  assert.equal(shortPass.user, undefined);
  assert.match(shortPass.error || '', /at least 6 characters/i);

  const invalidEmail = store.registerUser({
    name: 'John Doe',
    email: 'invalid-email',
    password: 'securepassword',
  });
  assert.equal(invalidEmail.user, undefined);
  assert.match(invalidEmail.error || '', /valid email/i);

  // 2. Successful Registration
  const regResult = store.registerUser({
    name: 'John Doe',
    email: 'john@example.com',
    password: 'securepassword',
  });
  assert.ok(regResult.user);
  assert.equal(regResult.user.name, 'John Doe');
  assert.equal(regResult.user.email, 'john@example.com');
  assert.ok(regResult.user.id.startsWith('usr_'));

  // 3. Issue and verify session token
  const token = signSessionToken(regResult.user.id, secret);
  assert.equal(verifySessionToken(token, secret), regResult.user.id);

  // 4. Duplicate Registration prevention
  const dupResult = store.registerUser({
    name: 'John Another',
    email: 'john@example.com',
    password: 'differentpassword',
  });
  assert.equal(dupResult.user, undefined);
  assert.match(dupResult.error || '', /already exists/i);

  // 5. Login with wrong password
  const badLogin = store.authenticateUser({
    email: 'john@example.com',
    password: 'wrongpassword',
  });
  assert.equal(badLogin.user, undefined);
  assert.match(badLogin.error || '', /Invalid email or password/i);

  // 6. Login with correct password
  const goodLogin = store.authenticateUser({
    email: 'john@example.com',
    password: 'securepassword',
  });
  assert.ok(goodLogin.user);
  assert.equal(goodLogin.user.id, regResult.user.id);

  // 7. Change password
  const changeRes = store.changePassword(regResult.user.id, 'securepassword', 'newsecret123');
  assert.equal(changeRes.ok, true);

  // 8. Old password fails after change
  const oldLogin = store.authenticateUser({
    email: 'john@example.com',
    password: 'securepassword',
  });
  assert.equal(oldLogin.user, undefined);

  // 9. New password succeeds
  const newLogin = store.authenticateUser({
    email: 'john@example.com',
    password: 'newsecret123',
  });
  assert.ok(newLogin.user);
  assert.equal(newLogin.user.id, regResult.user.id);
});
