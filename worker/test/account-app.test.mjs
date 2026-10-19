import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {createApp} from '../src/account-app.mjs';
const origin = 'https://stock-watch-app.lukestaz.workers.dev';
const request = (path, options) => new Request(origin + path, options);

test('default entry point serves assets and local-only health', async () => {
  const env = {BUILD_SHA: 'test-build', ASSETS: {fetch: async () => new Response('asset')}};
  assert.equal(await (await worker.fetch(request('/'), env)).text(), 'asset');
  const health = await worker.fetch(request('/api/health'), env);
  assert.deepEqual(await health.json(), {ok: true, mode: 'local-only-preview', build: 'test-build'});
  assert.equal(health.headers.get('Cache-Control'), 'no-store');
});

test('accounts remain disabled even if environment contains enable flags', async () => {
  for (const path of ['/api/v1/watchlist', '/api/v1/auth/start', '/api/v1/auth/complete', '/api/v1/auth/logout']) {
    const response = await worker.fetch(request(path), {ACCOUNTS_ENABLED: 'true'});
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Set-Cookie'), null);
  }
  assert.equal((await worker.fetch(request('/api/v1/auth/start', {method: 'POST'}), {})).status, 503);
});

test('invalid account configuration fails closed and never calls handler', async () => {
  let calls = 0;
  for (const accounts of [
    {enabled: 'true', allowedOrigin: origin},
    {enabled: true, allowedOrigin: 'http://app.example'},
    {enabled: true, allowedOrigin: origin + '/'},
    {enabled: true},
  ]) {
    const app = createApp({accounts: {...accounts, handle: async () => {calls++; return new Response('unsafe');}}});
    assert.equal((await app.fetch(request('/api/v1/watchlist'), {})).status, 503);
  }
  assert.equal(calls, 0);
});

test('explicit trusted account hook receives canonical path, method, cookies and body', async () => {
  let seen;
  const app = createApp({accounts: {enabled: true, allowedOrigin: origin, handle: async r => {
    seen = {url: r.url, method: r.method, cookie: r.headers.get('Cookie'), body: await r.json()};
    return Response.json({ok: true});
  }}});
  const response = await app.fetch(request('/api/v1/auth/complete', {
    method: 'POST', headers: {Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', Cookie: 'fixture=value'},
    body: JSON.stringify({idToken: 'fixture-token'})
  }), {});
  assert.equal(response.status, 200);
  assert.deepEqual(seen, {url: origin + '/v1/auth/complete', method: 'POST', cookie: 'fixture=value', body: {idToken: 'fixture-token'}});
});

test('account hook rejects unsafe origins and accepts marked same-origin GET', async () => {
  let calls = 0;
  const app = createApp({accounts: {enabled: true, allowedOrigin: origin, handle: async () => {calls++; return Response.json({ok: true});}}});
  for (const headers of [{}, {Origin: 'https://evil.example'}, {Origin: origin, 'Sec-Fetch-Site': 'cross-site'}]) {
    assert.equal((await app.fetch(request('/api/v1/watchlist', {headers}), {})).status, 403);
  }
  assert.equal((await app.fetch(request('/api/v1/auth/start', {method: 'POST'}), {})).status, 403);
  assert.equal((await app.fetch(request('/api/v1/watchlist?userId=other', {headers: {Origin: origin}}), {})).status, 400);
  assert.equal((await app.fetch(request('/api/v1/watchlist', {headers: {'Sec-Fetch-Site': 'same-origin'}}), {})).status, 200);
  assert.equal(calls, 1);
});

test('account hook failures do not expose exception text', async () => {
  const app = createApp({accounts: {enabled: true, allowedOrigin: origin, handle: async () => {throw Error('private database detail');}}});
  const response = await app.fetch(request('/api/v1/watchlist', {headers: {Origin: origin}}), {});
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private database detail/);
});

test('price proxy normalizes symbols and does not forward browser credentials', async () => {
  let seen;
  const response = await worker.fetch(request('/api/v1/stock?symbol=%20aapl%20', {headers: {Cookie: 'private=value', Authorization: 'private'}}), {
    PRICES: {fetch: async r => {seen = r; return Response.json({symbol: 'AAPL'});}}
  });
  assert.equal(response.status, 200);
  assert.equal(seen.url, 'https://stock-watch-prices.lukestaz.workers.dev/v1/stock?symbol=AAPL');
  assert.equal(seen.headers.get('Cookie'), null);
  assert.equal(seen.headers.get('Authorization'), null);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('bad symbols do not call price service; upstream status and retry header survive', async () => {
  let calls = 0;
  const env = {PRICES: {fetch: async () => {calls++; return Response.json({error: 'limited'}, {status: 429, headers: {'Retry-After': '60'}});}}};
  for (const symbol of ['', 'A/B', 'A'.repeat(16)]) assert.equal((await worker.fetch(request('/api/v1/stock?symbol=' + encodeURIComponent(symbol)), env)).status, 400);
  assert.equal(calls, 0);
  const response = await worker.fetch(request('/api/v1/stock?symbol=AAPL'), env);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.equal((await response.json()).error, 'limited');
});

test('proxy errors, unknown API routes and unsupported methods fail safely', async () => {
  const env = {PRICES: {fetch: async () => {throw Error('secret');}}};
  const response = await worker.fetch(request('/api/v1/stock?symbol=AAPL'), env);
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /secret/);
  assert.equal((await worker.fetch(request('/api/unknown'), {})).status, 404);
  assert.equal((await worker.fetch(request('/api/v1/stock', {method: 'POST'}), {})).status, 405);
});
