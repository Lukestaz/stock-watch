import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, execFileSync} from 'node:child_process';
import worker, {createAccountApp} from '../src/account-composition.mjs';
import {IDLE_TTL} from '../src/account-identity.mjs';
import {GOOGLE_JWKS_URL} from '../src/account-google-keys.mjs';
globalThis.crypto ??= webcrypto;
const origin = 'https://stock-watch-app.lukestaz.workers.dev';
const clientId = 'composition-test-client', initialTime = 1700000000;
const bridge = fileURLToPath(new URL('../../tests/schema/sqlite_d1_bridge.py', import.meta.url));
const pair = await crypto.subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign', 'verify']);
const jwk = {...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'composition-key', alg: 'RS256', use: 'sig'};
const b64 = value => Buffer.from(value).toString('base64url');
async function sign(nonce, sub = 'subject-a', changes = {}) {
  const head = b64(JSON.stringify({alg: 'RS256', kid: jwk.kid}));
  const body = b64(JSON.stringify({iss: 'https://accounts.google.com', aud: clientId,
    sub, nonce, iat: initialTime, exp: initialTime + 3600, ...changes}));
  const data = head + '.' + body;
  return data + '.' + b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(data)));
}
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'account-composition-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const file = join(dir, 'test.sqlite');
  execFileSync('python3', [bridge, file, 'init']);
  let time = initialTime, decision = true, provider = true, keyCalls = 0, dbCalls = 0;
  const limitedPaths = [];
  const db = {prepare: sql => ({bind: (...args) => ({sql, args})}), batch: statements => {
    dbCalls++;
    return new Promise((resolve, reject) => {
      const child = spawn('python3', [bridge, file, 'batch']); let out = '', err = '';
      child.stdout.on('data', d => out += d); child.stderr.on('data', d => err += d);
      child.on('error', reject); child.stdin.on('error', reject);
      child.on('close', code => {
        if (code !== 0) return reject(Error(err));
        try { resolve(JSON.parse(out)); } catch (e) { reject(e); }
      });
      child.stdin.end(JSON.stringify(statements));
    });
  }};
  const config = {enabled: true, allowedOrigin: origin, db, clientId, clock: () => time,
    limit: async (request, path) => {
      limitedPaths.push(path);
      if (decision === 'throw') throw Error('private limiter detail');
      return decision;
    },
    keyFetcher: async (url, options) => {
      keyCalls++; assert.equal(url, GOOGLE_JWKS_URL); assert.equal(options.redirect, 'error');
      if (!provider) throw Error('private provider detail');
      return Response.json({keys: [jwk]}, {headers: {'Cache-Control': 'max-age=3600'}});
    }};
  return {db, config, app: createAccountApp(config), limitedPaths,
    advance: seconds => time += seconds, setLimit: value => decision = value,
    setProvider: value => provider = value, keyCalls: () => keyCalls, dbCalls: () => dbCalls};
}
function request(path, {method = 'GET', body, cookie, headers = {}} = {}) {
  return new Request(origin + '/api' + path, {method, headers: {
    'Sec-Fetch-Site': 'same-origin', ...(method !== 'GET' ? {Origin: origin} : {}),
    ...(body !== undefined ? {'Content-Type': 'application/json'} : {}),
    ...(cookie ? {Cookie: cookie} : {}), ...headers
  }, ...(body !== undefined ? {body: JSON.stringify(body)} : {})});
}
const send = (app, path, options) => app.fetch(request(path, options), {BUILD_SHA: 'fixture'});
const query = (db, sql, args = []) => db.batch([db.prepare(sql).bind(...args)]).then(r => r[0].results);
async function begin(app) {
  const response = await send(app, '/v1/auth/start', {method: 'POST', body: {}});
  assert.equal(response.status, 200);
  const body = await response.json(); assert.deepEqual(Object.keys(body), ['nonce']);
  const cookie = response.headers.getSetCookie()[0].split(';')[0];
  return {nonce: body.nonce, cookie};
}
async function login(app, sub = 'subject-a') {
  const start = await begin(app);
  const response = await send(app, '/v1/auth/complete', {method: 'POST',
    cookie: start.cookie, body: {idToken: await sign(start.nonce, sub)}});
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), {ok: true});
  const cookies = response.headers.getSetCookie(); assert.equal(cookies.length, 2);
  assert.match(cookies[1], /Max-Age=0/);
  return cookies[0].split(';')[0];
}
const stock = target => ({symbol: 'LUNR', target, alertsEnabled: false});
const save = (app, cookie, target, expectedRevision = 0) => send(app, '/v1/watchlist', {
  method: 'PUT', cookie, body: {expectedRevision, stocks: [stock(target)]}
});

test('default export and invalid configuration cannot touch identity or keys', async () => {
  let calls = 0;
  const config = {enabled: true, allowedOrigin: origin, clientId,
    db: {prepare() {calls++; throw Error();}, batch() {calls++; throw Error();}},
    limit: async () => true, keyFetcher: async () => {calls++; throw Error();}};
  for (const app of [worker, createAccountApp({...config, enabled: 'true'}),
    createAccountApp({...config, allowedOrigin: origin + '/'}),
    createAccountApp({...config, limit: undefined}), createAccountApp({...config, db: null}),
    createAccountApp({...config, clientId: ' '}), createAccountApp({...config, clock: 1})]) {
    assert.equal((await send(app, '/v1/auth/start', {method: 'POST', body: {}})).status, 503);
  }
  assert.equal(calls, 0);
});

test('signed login traverses key loader, cookies, sessions and persistent watchlist', async t => {
  const f = fixture(t), cookie = await login(f.app);
  const empty = await send(f.app, '/v1/watchlist', {cookie});
  assert.equal(empty.status, 200); assert.deepEqual((await empty.json()).stocks, []);
  const saved = await save(f.app, cookie, 12.5); assert.equal(saved.status, 200);
  assert.equal((await saved.json()).revision, 1);
  const read = await send(f.app, '/v1/watchlist', {cookie});
  assert.deepEqual((await read.json()).stocks, [stock(12.5)]);
  assert.equal(read.headers.get('Cache-Control'), 'no-store');
  assert.equal(f.keyCalls(), 1);
  const rows = await query(f.db, 'SELECT token_hash FROM sessions');
  assert.match(rows[0].token_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(rows[0].token_hash, cookie.split('=')[1]);
});

test('returning subjects share data; different subjects stay isolated; keys are reused', async t => {
  const f = fixture(t), a = await login(f.app);
  assert.equal((await save(f.app, a, 10)).status, 200);
  const secondDevice = await login(f.app), b = await login(f.app, 'subject-b');
  assert.deepEqual((await (await send(f.app, '/v1/watchlist', {cookie: secondDevice})).json()).stocks, [stock(10)]);
  assert.deepEqual((await (await send(f.app, '/v1/watchlist', {cookie: b})).json()).stocks, []);
  assert.equal((await save(f.app, b, 20)).status, 200);
  assert.deepEqual((await (await send(f.app, '/v1/watchlist', {cookie: a})).json()).stocks, [stock(10)]);
  assert.equal(f.keyCalls(), 1);
});

test('simultaneous exchanges and replay create only one session', async t => {
  const f = fixture(t), start = await begin(f.app), idToken = await sign(start.nonce);
  const complete = () => send(f.app, '/v1/auth/complete', {method: 'POST', cookie: start.cookie, body: {idToken}});
  const responses = await Promise.all([complete(), complete()]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 401]);
  assert.equal((await complete()).status, 401);
  assert.equal((await query(f.db, 'SELECT count(*) AS n FROM sessions'))[0].n, 1);
});

test('wrong nonce, audience or signature cannot establish a session', async t => {
  const f = fixture(t), start = await begin(f.app);
  const valid = await sign(start.nonce), parts = valid.split('.');
  parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
  for (const idToken of [await sign('a'.repeat(64)), await sign(start.nonce, 'subject-a', {aud: 'other'}), parts.join('.')]) {
    const response = await send(f.app, '/v1/auth/complete', {method: 'POST', cookie: start.cookie, body: {idToken}});
    assert.equal(response.status, 401);
  }
  assert.equal((await query(f.db, 'SELECT count(*) AS n FROM sessions'))[0].n, 0);
  assert.equal((await send(f.app, '/v1/watchlist')).status, 401);
});

test('expired challenge, idle session and logout are enforced through HTTP routing', async t => {
  const expired = fixture(t), start = await begin(expired.app), idToken = await sign(start.nonce);
  expired.advance(601);
  assert.equal((await send(expired.app, '/v1/auth/complete', {method: 'POST', cookie: start.cookie, body: {idToken}})).status, 401);
  const idle = fixture(t), idleCookie = await login(idle.app); idle.advance(IDLE_TTL);
  assert.equal((await send(idle.app, '/v1/watchlist', {cookie: idleCookie})).status, 401);
  const f = fixture(t), a = await login(f.app), b = await login(f.app, 'subject-b');
  const logout = await send(f.app, '/v1/auth/logout', {method: 'POST', cookie: a, body: {}});
  assert.equal(logout.status, 200); assert.match(logout.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.equal((await send(f.app, '/v1/watchlist', {cookie: a})).status, 401);
  assert.equal((await send(f.app, '/v1/watchlist', {cookie: b})).status, 200);
});

test('origin violations stop before storage; injected identity and stale saves are rejected', async t => {
  const f = fixture(t);
  const denied = await f.app.fetch(new Request(origin + '/api/v1/auth/start', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'
  }), {});
  assert.equal(denied.status, 403);
  assert.equal((await send(f.app, '/v1/watchlist', {headers: {Origin: 'https://evil.example'}})).status, 403);
  assert.equal((await send(f.app, '/v1/watchlist', {headers: {'Sec-Fetch-Site': 'cross-site'}})).status, 403);
  assert.equal(f.dbCalls(), 0);
  const cookie = await login(f.app);
  assert.equal((await send(f.app, '/v1/watchlist', {method: 'PUT', cookie,
    body: {expectedRevision: 0, stocks: [stock(10)], userId: 'u2'}})).status, 400);
  assert.equal((await save(f.app, cookie, 10)).status, 200);
  assert.equal((await save(f.app, cookie, 20)).status, 409);
  assert.deepEqual((await (await send(f.app, '/v1/watchlist', {cookie})).json()).stocks, [stock(10)]);
});

test('limiter denial or failure protects login and watchlists without storage access', async t => {
  const f = fixture(t), cookie = await login(f.app), before = f.dbCalls();
  for (const [value, status] of [[false, 429], ['truthy', 429], ['throw', 503]]) {
    f.setLimit(value);
    const a = await send(f.app, '/v1/auth/start', {method: 'POST', body: {}});
    const b = await send(f.app, '/v1/watchlist', {cookie});
    assert.equal(a.status, status); assert.equal(b.status, status);
    assert.doesNotMatch(await a.text() + await b.text(), /private limiter detail/);
  }
  assert.equal(f.dbCalls(), before);
  assert.ok(f.limitedPaths.includes('/v1/auth/start'));
  assert.ok(f.limitedPaths.includes('/v1/watchlist'));
});

test('key-provider outage fails closed and an unconsumed challenge can recover', async t => {
  const f = fixture(t), start = await begin(f.app), idToken = await sign(start.nonce);
  const complete = () => send(f.app, '/v1/auth/complete', {method: 'POST', cookie: start.cookie, body: {idToken}});
  f.setProvider(false); const failure = await complete(); assert.equal(failure.status, 503);
  assert.doesNotMatch(await failure.text(), /private provider detail/);
  assert.equal((await query(f.db, 'SELECT count(*) AS n FROM sessions'))[0].n, 0);
  f.setProvider(true); f.advance(6); assert.equal((await complete()).status, 200);
});

test('storage failure is generic and preview routes remain separate', async t => {
  const f = fixture(t), cookie = await login(f.app);
  await query(f.db, 'DROP TABLE sessions');
  const response = await send(f.app, '/v1/watchlist', {cookie});
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /sessions|sqlite|no such table/);
  const env = {ASSETS: {fetch: async () => new Response('asset')},
    PRICES: {fetch: async () => Response.json({symbol: 'AAPL'})}};
  assert.equal(await (await f.app.fetch(new Request(origin + '/'), env)).text(), 'asset');
  assert.equal((await f.app.fetch(new Request(origin + '/api/v1/stock?symbol=AAPL'), env)).status, 200);
});
