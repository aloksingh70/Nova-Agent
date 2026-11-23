import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readCookieConsent,
  saveCookieConsent,
  shouldRecordAnalytics,
} from './analytics';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

test('cookie consent defaults to null and gates analytics strictly on explicit opt-in', () => {
  const mem = createMemoryStorage();
  assert.equal(readCookieConsent(mem), null);
  assert.equal(shouldRecordAnalytics(null), false);

  const essentialOnly = saveCookieConsent(false, mem);
  assert.equal(essentialOnly.essential, true);
  assert.equal(essentialOnly.analytics, false);
  assert.equal(shouldRecordAnalytics(readCookieConsent(mem)), false);

  const acceptedAll = saveCookieConsent(true, mem);
  assert.equal(acceptedAll.analytics, true);
  assert.equal(shouldRecordAnalytics(readCookieConsent(mem)), true);
});
