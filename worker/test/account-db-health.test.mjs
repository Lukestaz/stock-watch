import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/account-app.mjs';
const request = () => new Request('https://stock-watch-app.lukestaz.workers.dev/api/health');

test('bound database health runs only zero-row reads against all five account tables', async () => {
  const queries = [];
  const env = {BUILD_SHA: 'fixture', DB: {
    prepare(sql) {queries.push(sql); return sql;},
    async batch(statements) {return statements.map(() => ({success: true, results: []}));}
  }};
  const r = await worker.fetch(request(), env), body = await r.json();
  assert.equal(r.status, 200); assert.deepEqual(body.database, {bound: true, ready: true});
  assert.equal(body.mode, 'local-only-preview'); assert.equal(queries.length, 5);
  for (const q of queries) assert.match(q, /^SELECT .+ FROM [a-z_]+ LIMIT 0$/);
  assert.ok(queries.some(q => q.includes('write_token')));
  const disabled = await worker.fetch(new Request('https://stock-watch-app.lukestaz.workers.dev/api/v1/watchlist'), env);
  assert.equal(disabled.status, 503); assert.equal(disabled.headers.get('Set-Cookie'), null);
});

test('database errors, incomplete batches and failed results fail without private details', async () => {
  for (const batch of [async () => {throw Error('PRIVATE-DO-NOT-LOG');}, async () => [],
    async () => Array.from({length: 5}, () => ({success: false, results: []}))]) {
    const r = await worker.fetch(request(), {DB: {prepare: sql => sql, batch}});
    assert.equal(r.status, 503);
    const text = await r.text(); assert.doesNotMatch(text, /PRIVATE-DO-NOT-LOG|token_hash|google_sub/);
    assert.deepEqual(JSON.parse(text).database, {bound: true, ready: false});
  }
});

test('unbound local-only mode remains compatible but does not claim database readiness', async () => {
  const r = await worker.fetch(request(), {BUILD_SHA: 'fixture'});
  assert.deepEqual(await r.json(), {ok: true, mode: 'local-only-preview', build: 'fixture'});
});
