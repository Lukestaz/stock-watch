import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimplicityRoute } from '../src/simplicity-route.mjs';
const id = 'simplicity:kiwisaver:high-growth';
const env = () => ({ SIMPLICITY_READ_ONLY: 'true', APP_ORIGIN: 'https://app.example', ACCOUNT_LIMIT: { limit: async () => ({ success: true }) } });
const request = (suffix = `series=${encodeURIComponent(id)}`, init = {}) => new Request('https://app.example/api/v1/fund?' + suffix, { ...init, headers: { 'CF-Connecting-IP': '192.0.2.1', ...init.headers } });
const load = async fund => ({ seriesId: fund.seriesId, fetchedAt: '2026-11-07T10:00:00Z', history: [{ asOfDate: '2026-11-04', price: 1.2 }] });
const snapshot = async result => ({ seriesId: result.seriesId, fetchedAt: result.fetchedAt, freshness: 'unchecked', alertEligible: false, identityVerified: false });

test('disabled route never fetches', async () => {
  const handler = createSimplicityRoute({ load: () => { throw Error('must not fetch'); } });
  assert.equal((await handler(request(), { ...env(), SIMPLICITY_READ_ONLY: 'false' })).status, 404);
});
test('rejects foreign origins, methods and ambiguous series', async () => {
  const handler = createSimplicityRoute({ load, snapshot });
  assert.equal((await handler(request(undefined, { headers: { Origin: 'https://evil.example' } }), env())).status, 403);
  assert.equal((await handler(request(undefined, { method: 'POST' }), env())).status, 405);
  assert.equal((await handler(request('series=unknown'), env())).status, 400);
  assert.equal((await handler(request('series=x&series=y'), env())).status, 400);
});
test('requires working limiter even for public data', async () => {
  const handler = createSimplicityRoute({ load, snapshot });
  assert.equal((await handler(request(), { ...env(), ACCOUNT_LIMIT: null })).status, 503);
  assert.equal((await handler(request(), { ...env(), ACCOUNT_LIMIT: { limit: async () => ({ success: false }) } })).status, 429);
});
test('cache reuse preserves original fetch timestamp', async () => {
  let count = 0;
  const handler = createSimplicityRoute({ load: async f => { count++; return load(f); }, snapshot });
  assert.equal((await (await handler(request(), env())).json()).cache.state, 'refreshed');
  const value = await (await handler(request(), env())).json();
  assert.equal(value.cache.state, 'cached');
  assert.equal(value.snapshot.fetchedAt, '2026-11-07T10:00:00Z');
  assert.equal(count, 1);
});
test('concurrent requests share an upstream fetch', async () => {
  let count = 0;
  const handler = createSimplicityRoute({ load: async f => { count++; await new Promise(r => setTimeout(r, 10)); return load(f); }, snapshot });
  const responses = await Promise.all([handler(request(), env()), handler(request(), env())]);
  assert.ok(responses.every(r => r.status === 200));
  assert.equal(count, 1);
});
test('failed refresh labels last success stale and backs off', async () => {
  let clock = 1000000000000, count = 0;
  const handler = createSimplicityRoute({ now: () => clock, snapshot, load: async f => { if (++count > 1) throw Error('offline'); return load(f); } });
  await handler(request(), env());
  clock += 3600001;
  const failed = await handler(request(), env());
  assert.equal(failed.status, 503);
  const value = await failed.json();
  assert.equal(value.cache.state, 'stale');
  assert.equal(value.lastSuccessful.snapshot.fetchedAt, '2026-11-07T10:00:00Z');
  await handler(request(), env());
  assert.equal(count, 2);
});
