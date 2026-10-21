import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoginRoutes} from '../src/account-login-routes.mjs';
import {CHALLENGE_COOKIE, SESSION_COOKIE, cookie} from '../src/account-identity.mjs';
const origin = 'https://stock-watch-app.lukestaz.workers.dev';
const challenge = 'A'.repeat(43), session = 'B'.repeat(43);
const startCookie = cookie(CHALLENGE_COOKIE, challenge, 600);
const sessionCookie = cookie(SESSION_COOKIE, session, 3600);
const clearCookie = cookie(CHALLENGE_COOKIE, '', 0);
function fixture(overrides = {}) {
  const calls = [];
  const identity = {
    beginLogin: async () => {calls.push('start'); return {nonce: 'public-nonce', challenge, setCookie: startCookie, private: 'do-not-serialize'};},
    completeLogin: async input => {calls.push(input); return {setCookie: sessionCookie, clearChallenge: clearCookie, userId: 'private-id'};},
    logout: async () => {calls.push('logout'); return {setCookie: cookie(SESSION_COOKIE, '', 0)};},
  };
  return {calls, route: createLoginRoutes({enabled: true, allowedOrigin: origin, identity, limit: async () => true, ...overrides})};
}
function request(path = '/v1/auth/start', {method = 'POST', headers = {}, raw = '{}', urlOrigin = origin} = {}) {
  return new Request(urlOrigin + path, {method, headers: {Origin: origin, 'Content-Type': 'application/json', ...headers}, ...(['GET','HEAD'].includes(method) ? {} : {body: raw})});
}

test('login is default-off and configuration must include a limiter', async () => {
  assert.equal((await createLoginRoutes()(request())).status, 503);
  assert.equal((await fixture({enabled: 'true'}).route(request())).status, 503);
  assert.equal((await fixture({limit: undefined}).route(request())).status, 503);
  assert.equal((await fixture({allowedOrigin: origin + '/'}).route(request())).status, 503);
});

test('start returns nonce only, with challenge confined to secure cookie', async () => {
  const {route, calls} = fixture(); const response = await route(request());
  assert.deepEqual(await response.json(), {nonce: 'public-nonce'});
  assert.deepEqual(response.headers.getSetCookie(), [startCookie]);
  assert.match(startCookie, /Secure; HttpOnly; SameSite=Lax/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(calls, ['start']);
});

test('completion binds token to cookie and preserves two Set-Cookie fields', async () => {
  const {route, calls} = fixture();
  const response = await route(request('/v1/auth/complete', {headers: {Cookie: CHALLENGE_COOKIE + '=' + challenge}, raw: JSON.stringify({idToken: 'fixture-token'})}));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), {ok: true});
  assert.deepEqual(calls, [{challenge, idToken: 'fixture-token'}]);
  assert.deepEqual(response.headers.getSetCookie(), [sessionCookie, clearCookie]);
});

test('missing, malformed and duplicate challenge cookies cannot complete', async () => {
  const {route, calls} = fixture();
  for (const value of ['', CHALLENGE_COOKIE + '=short', CHALLENGE_COOKIE + '=' + challenge + '; ' + CHALLENGE_COOKIE + '=' + challenge]) {
    assert.equal((await route(request('/v1/auth/complete', {headers: {Cookie: value}, raw: '{"idToken":"fixture"}'}))).status, 401);
  }
  assert.equal(calls.length, 0);
});

test('origin, fetch metadata, method, query and media-type checks reject requests', async () => {
  const {route, calls} = fixture();
  for (const options of [{headers: {Origin: 'https://evil.example'}}, {headers: {'Sec-Fetch-Site': 'cross-site'}}, {urlOrigin: 'https://other.example'}, {urlOrigin: 'http://stock-watch-app.lukestaz.workers.dev'}]) {
    assert.equal((await route(request('/v1/auth/start', options))).status, 403);
  }
  assert.equal((await route(request('/v1/auth/start', {method: 'GET'}))).status, 405);
  assert.equal((await route(request('/v1/auth/start?x=1'))).status, 400);
  assert.equal((await route(request('/v1/auth/start', {headers: {'Content-Type': 'text/plain'}}))).status, 415);
  assert.equal((await route(request('/v1/auth/unknown'))).status, 404);
  assert.equal(calls.length, 0);
});

test('rate limiter denial or failure prevents identity calls', async () => {
  const denied = fixture({limit: async () => false});
  assert.equal((await denied.route(request())).status, 429); assert.equal(denied.calls.length, 0);
  const broken = fixture({limit: async () => {throw Error('private limiter detail');}});
  const response = await broken.route(request()); assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private limiter detail/); assert.equal(broken.calls.length, 0);
});

test('invalid bodies, identity injection and oversized requests are rejected', async () => {
  const {route, calls} = fixture();
  for (const raw of ['{', 'null', '[]', '{"challenge":"injected"}', ' '.repeat(18001)]) {
    assert.equal((await route(request('/v1/auth/start', {raw}))).status, 400);
  }
  for (const body of [{}, {idToken: ''}, {idToken: 123}, {idToken: 'x', challenge}, {idToken: 'x'.repeat(16385)}]) {
    assert.equal((await route(request('/v1/auth/complete', {raw: JSON.stringify(body)}))).status, 400);
  }
  assert.equal(calls.length, 0);
});

test('logout expires session cookie; authentication and storage errors stay generic', async () => {
  const {route, calls} = fixture(); const response = await route(request('/v1/auth/logout'));
  assert.deepEqual(await response.json(), {ok: true});
  assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/); assert.deepEqual(calls, ['logout']);
  for (const [message, status] of [['Invalid identity', 401], ['Invalid login challenge', 401], ['private database detail', 503]]) {
    const failing = fixture({identity: {beginLogin() {}, logout() {}, completeLogin: async () => {throw Error(message);}}});
    const reply = await failing.route(request('/v1/auth/complete', {headers: {Cookie: CHALLENGE_COOKIE + '=' + challenge}, raw: '{"idToken":"fixture"}'}));
    assert.equal(reply.status, status); assert.doesNotMatch(await reply.text(), /private database detail/);
  }
});
