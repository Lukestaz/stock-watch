import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {createAccountWorker} from '../src/account-runtime.mjs';
const origin = 'https://stock-watch-app.lukestaz.workers.dev';
const request = () => new Request(origin + '/api/health');
const configured = () => ({ACCOUNTS_ENABLED: 'true', APP_ORIGIN: origin,
  GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com',
  DB: {prepare() {}, batch() {}}, ACCOUNT_LIMIT: {limit: async () => ({success: true})}});

test('real default runtime preserves assets and disabled account routes', async () => {
  const env = {BUILD_SHA: 'fixture', ASSETS: {fetch: async () => new Response('asset')}};
  assert.equal(await (await worker.fetch(new Request(origin), env)).text(), 'asset');
  assert.equal((await (await worker.fetch(request(), env)).json()).mode, 'local-only-preview');
  for (const path of ['watchlist', 'auth/start', 'auth/complete', 'auth/logout']) {
    const r = await worker.fetch(new Request(origin + '/api/v1/' + path), env);
    assert.equal(r.status, 503); assert.equal(r.headers.get('Set-Cookie'), null);
  }
});

test('enablement requires explicit flag and all runtime dependencies', async () => {
  for (const field of ['ACCOUNTS_ENABLED', 'DB', 'GOOGLE_CLIENT_ID', 'ACCOUNT_LIMIT']) {
    const env = configured(); delete env[field]; let seen;
    const app = createAccountWorker({compose: c => {seen = c; return {fetch: async () => new Response('ok')};}});
    await app.fetch(request(), env); assert.equal(seen.enabled, false);
  }
});

test('trusted configuration is reused per environment but not across environments', async () => {
  const calls = [], env = configured();
  const app = createAccountWorker({compose: c => {calls.push(c); return {fetch: async () => new Response('ok')};}});
  await app.fetch(request(), env); await app.fetch(request(), env);
  await app.fetch(request(), configured());
  assert.equal(calls.length, 2); assert.equal(calls[0].enabled, true);
  assert.equal(calls[0].db, env.DB); assert.equal(calls[0].allowedOrigin, origin);
  assert.equal(calls[0].clientId, env.GOOGLE_CLIENT_ID);
});

test('limiter requires client address and explicit success; binding receiver is preserved', async () => {
  let seen, config; const env = configured();
  env.ACCOUNT_LIMIT.limit = async function (arg) {assert.equal(this, env.ACCOUNT_LIMIT); seen = arg; return {success: true};};
  const app = createAccountWorker({compose: c => {config = c; return {fetch: async () => new Response('ok')};}});
  await app.fetch(request(), env);
  assert.equal(await config.limit(request(), '/v1/watchlist'), false);
  const r = new Request(origin, {headers: {'CF-Connecting-IP': '192.0.2.1'}});
  assert.equal(await config.limit(r, '/v1/watchlist'), true);
  assert.deepEqual(seen, {key: 'accounts:/v1/watchlist:192.0.2.1'});
  env.ACCOUNT_LIMIT.limit = async () => ({success: false});
  assert.equal(await config.limit(r, '/v1/auth/start'), false);
});
