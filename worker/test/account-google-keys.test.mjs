import test from 'node:test';
import assert from 'node:assert/strict';
import {createGoogleKeyLoader, readBoundedJson, GOOGLE_JWKS_URL} from '../src/account-google-keys.mjs';
const key = (kid = 'fixture') => ({kty: 'RSA', alg: 'RS256', use: 'sig', kid, n: 'A'.repeat(342), e: 'AQAB'});
const response = (keys = [key()], headers = {}) => Response.json({keys}, {headers: {'Cache-Control': 'max-age=60', ...headers}});

test('fixed endpoint, cache reuse, defensive copies and expiration', async () => {
  let now = 0, calls = 0;
  const load = createGoogleKeyLoader({clock: () => now, fetcher: async (url, options) => {
    calls++; assert.equal(url, GOOGLE_JWKS_URL); assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
    assert.ok(options.signal instanceof AbortSignal); return response();
  }});
  const first = await load(); first[0].kid = 'mutated';
  assert.equal((await load())[0].kid, 'fixture'); assert.equal(calls, 1);
  now = 60000; await load(); assert.equal(calls, 2);
});

test('concurrent loads share a single request', async () => {
  let release, calls = 0;
  const gate = new Promise(resolve => {release = resolve;});
  const load = createGoogleKeyLoader({fetcher: async () => {calls++; await gate; return response();}});
  const a = load(), b = load(); release();
  assert.deepEqual(await a, await b); assert.equal(calls, 1);
});

test('cache policy and Age prevent use beyond freshness', async () => {
  for (const headers of [{'Cache-Control': 'no-store'}, {'Cache-Control': 'no-cache'}, {'Cache-Control': 'max-age=60', Age: '60'}]) {
    let calls = 0;
    const load = createGoogleKeyLoader({fetcher: async () => {calls++; return response([key()], headers);}});
    await load(); await load(); assert.equal(calls, 2);
  }
});

test('bad HTTP, content, duplicate keys and private material fail closed', async () => {
  const factories = [
    () => new Response('denied', {status: 403}),
    () => new Response('{}', {headers: {'Content-Type': 'text/html'}}),
    () => new Response('{', {headers: {'Content-Type': 'application/json'}}),
    () => response([]), () => response([key(), key()]),
    () => response([{...key(), d: 'private'}]),
    () => response([{...key(), alg: 'HS256'}]),
    () => response([{...key(), n: 'short'}]),
    () => response(Array.from({length: 11}, (_, i) => key(String(i)))),
    () => new Response(' '.repeat(65537), {headers: {'Content-Type': 'application/json'}}),
  ];
  for (const factory of factories) {
    const load = createGoogleKeyLoader({fetcher: async () => factory()});
    await assert.rejects(load(), /^Error: Google keys unavailable$/);
  }
});

test('expired keys are not served on refresh failure; retry is backed off', async () => {
  let now = 0, calls = 0;
  const load = createGoogleKeyLoader({clock: () => now, fetcher: async () => {
    calls++; if (calls > 1) throw Error('private upstream detail'); return response();
  }});
  await load(); now = 60000;
  await assert.rejects(load(), /Google keys unavailable/);
  await assert.rejects(load(), /Google keys unavailable/); assert.equal(calls, 2);
  now += 5000; await assert.rejects(load(), /Google keys unavailable/); assert.equal(calls, 3);
});

test('timeout aborts a cooperative fetch and yields a safe error', async () => {
  const load = createGoogleKeyLoader({timeoutMs: 10, fetcher: async (url, {signal}) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(Error('private timeout')), {once: true});
  })});
  await assert.rejects(load(), /^Error: Google keys unavailable$/);
});

test('bounded JSON rejects missing, oversized and invalid UTF-8 bodies', async () => {
  await assert.rejects(readBoundedJson(new Response(null), 10));
  await assert.rejects(readBoundedJson(new Response('123456'), 5));
  await assert.rejects(readBoundedJson(new Response(new Uint8Array([255])), 10));
  assert.deepEqual(await readBoundedJson(new Response('{"ok":true}'), 11), {ok: true});
});
