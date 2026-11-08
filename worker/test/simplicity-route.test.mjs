import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createSimplicityRoute } from '../src/simplicity-route.mjs';
import { createSimplicityStore } from '../src/simplicity-store.mjs';
const id = 'simplicity:kiwisaver:high-growth';
const request = (query = `series=${encodeURIComponent(id)}`, init = {}) => new Request('https://app.example/api/v1/fund?' + query, { ...init, headers: { 'CF-Connecting-IP': '192.0.2.1', ...init.headers } });
const payload = (price = 1.2) => ({ seriesId: id, fetchedAt: '2026-11-07T10:00:00Z', history: [{ seriesId: id, asOfDate: '2026-11-04', price, currency: 'NZD' }] });
const snapshot = async result => ({ seriesId: result.seriesId, fetchedAt: result.fetchedAt, freshness: 'unchecked', alertEligible: false, identityVerified: false });
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'simplicity-route-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'test.sqlite');
  const bridge = new URL('../../tests/schema/simplicity_bridge.py', import.meta.url);
  function call(mode, statements = []) {
    const result = spawnSync('python3', [bridge.pathname, file, mode], { input: JSON.stringify(statements), encoding: 'utf8' });
    if (result.status !== 0) throw Error(result.stderr);
    return JSON.parse(result.stdout);
  }
  call('init');
  const db = { prepare: sql => ({ bind: (...args) => ({ sql, args }) }), batch: async statements => call('batch', statements) };
  let clock = Date.parse('2026-11-07T10:00:00Z'), owners = 0, calls = 0;
  const env = { DB: db, SIMPLICITY_READ_ONLY: 'true', APP_ORIGIN: 'https://app.example', ACCOUNT_LIMIT: { limit: async () => ({ success: true }) } };
  return { env, store: () => createSimplicityStore(db), seconds: () => Math.floor(clock / 1000), advance: ms => { clock += ms; }, calls: () => calls,
    make: (options = {}) => createSimplicityRoute({ snapshot, now: () => clock, ownerId: () => `test-${++owners}`, load: async () => { calls++; return payload(); }, ...options }) };
}

test('disabled and invalid requests never reach persistence or upstream', async t => {
  const f = fixture(t), handler = f.make();
  assert.equal((await handler(request(), { ...f.env, SIMPLICITY_READ_ONLY: 'false' })).status, 404);
  assert.equal((await handler(request(undefined, { headers: { Origin: 'https://evil.example' } }), f.env)).status, 403);
  assert.equal((await handler(request(undefined, { method: 'POST' }), f.env)).status, 405);
  assert.equal((await handler(request('series=unknown'), f.env)).status, 400);
  assert.equal((await handler(request('series=x&series=y'), f.env)).status, 400);
  assert.equal(f.calls(), 0);
});
test('rate limiter is required and enforced', async t => {
  const f = fixture(t), handler = f.make();
  assert.equal((await handler(request(), { ...f.env, ACCOUNT_LIMIT: null })).status, 503);
  assert.equal((await handler(request(), { ...f.env, ACCOUNT_LIMIT: { limit: async () => ({ success: false }) } })).status, 429);
  assert.equal(f.calls(), 0);
});
test('separate route instances reuse durable history and original timestamp', async t => {
  const f = fixture(t);
  assert.equal((await (await f.make()(request(), f.env)).json()).cache.state, 'refreshed');
  const response = await f.make()(request(), f.env);
  const value = await response.json();
  assert.equal(response.status, 200);
  assert.equal(value.cache.storage, 'd1');
  assert.equal(value.cache.state, 'cached');
  assert.equal(value.snapshot.fetchedAt, payload().fetchedAt);
  assert.equal(value.history[0].price, 1.2);
  assert.equal(f.calls(), 1);
});
test('active lease prevents another route from fetching', async t => {
  const f = fixture(t);
  await f.store().claim(id, 'external-owner', f.seconds());
  const response = await f.make()(request(), f.env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).cache.reason, 'refresh-in-progress');
  assert.equal(f.calls(), 0);
});
test('failed refresh preserves last success and backoff across route instances', async t => {
  const f = fixture(t);
  await f.make()(request(), f.env);
  f.advance(3600001);
  let failures = 0;
  const options = { load: async () => { failures++; throw Error('offline'); } };
  const response = await f.make(options)(request(), f.env);
  const value = await response.json();
  assert.equal(response.status, 503);
  assert.equal(value.cache.state, 'stale');
  assert.equal(value.lastSuccessful.snapshot.fetchedAt, payload().fetchedAt);
  await f.make(options)(request(), f.env);
  assert.equal(failures, 1);
});
test('missing or broken D1 never falls back to upstream fetching', async t => {
  const f = fixture(t), handler = f.make();
  assert.equal((await handler(request(), { ...f.env, DB: null })).status, 503);
  assert.equal((await handler(request(), { ...f.env, DB: { prepare: () => { throw Error('missing table'); }, batch: async () => [] } })).status, 503);
  assert.equal(f.calls(), 0);
});
test('expired owner cannot replace a newer route result', async t => {
  const f = fixture(t);
  const handler = f.make({ load: async () => {
    f.advance(91000);
    const store = f.store();
    assert.equal(await store.claim(id, 'new-owner', f.seconds()), true);
    await store.save(id, 'new-owner', f.seconds(), payload(2));
    return payload(9);
  }});
  const response = await handler(request(), f.env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).history[0].price, 2);
});
test('stale fallback expires after seven days', async t => {
  const f = fixture(t);
  await f.make()(request(), f.env);
  f.advance(604801000);
  const response = await f.make({ load: async () => { throw Error('offline'); } })(request(), f.env);
  const value = await response.json();
  assert.equal(response.status, 503);
  assert.equal(value.cache.state, 'unavailable');
  assert.equal(value.lastSuccessful, null);
});
