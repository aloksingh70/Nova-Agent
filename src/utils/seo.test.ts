import test from 'node:test';
import assert from 'node:assert/strict';
import { FAQ_ITEMS, getRouteSeoMeta, resolveRouteFromPath } from './seo';

test('resolveRouteFromPath resolves landing, studio, privacy, terms, autostart, and 404', () => {
  assert.equal(resolveRouteFromPath('/'), 'landing');
  assert.equal(resolveRouteFromPath('/', '?autostart=1'), 'studio');
  assert.equal(resolveRouteFromPath('/studio'), 'studio');
  assert.equal(resolveRouteFromPath('/studio/'), 'studio');
  assert.equal(resolveRouteFromPath('/privacy'), 'privacy');
  assert.equal(resolveRouteFromPath('/terms'), 'terms');
  assert.equal(resolveRouteFromPath('/this-route-does-not-exist'), 'not-found');
});

test('getRouteSeoMeta keeps titles and descriptions within SEO best-practice lengths', () => {
  for (const route of ['landing', 'studio', 'privacy', 'terms', 'not-found'] as const) {
    const meta = getRouteSeoMeta(route, '/missing');
    assert.ok(meta.title.length >= 20 && meta.title.length <= 65, `title length for ${route}`);
    assert.ok(
      meta.description.length >= 110 && meta.description.length <= 165,
      `description length for ${route}: ${meta.description.length}`
    );
  }
  assert.equal(getRouteSeoMeta('not-found', '/bad').robots, 'noindex, follow');
  assert.equal(getRouteSeoMeta('landing').robots, 'index, follow');
  assert.ok(FAQ_ITEMS.length >= 5);
});
