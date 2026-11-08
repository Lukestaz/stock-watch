import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createSimplicityRoute } from '../src/simplicity-route.mjs';
import { fetchSimplicityHistory } from '../src/simplicity-fetch.mjs';
const csv = 'Date,Price\n02-05-2023,1\n03-11-2026,1.2\n04-11-2026,1.25';
function fixture(t, body = csv) {
  const dir = mkdtempSync(join(tmpdir(), 'simplicity-pipeline-'));
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
  const env = { DB: db, SIMPLICITY_READ_ONLY: 'true', APP_ORIGIN: 'https://app.example', ACCOUNT_LIMIT: { limit: async () => ({ success: true }) } };
  let calls = 0, owners = 0;
  const now = () => Date.parse('2026-11-07T10:00:00Z');
  return { env, calls: () => calls, make: () => createSimplicityRoute({ now, ownerId: () => `pipeline-${++owners}`,
    load: fund => fetchSimplicityHistory({ ...fund, verificationStatus: 'verified' }, {
      now: () => new Date(now()), fetchImpl: async () => {
        calls++;
        return new Response(body, { headers: { 'content-type': 'text/csv' } });
      }
    })
  }) };
}
const request = id => new Request('https://app.example/api/v1/fund?series=' + encodeURIComponent(id), { headers: { 'CF-Connecting-IP': '192.0.2.1' } });
test('CSV to real parser and snapshot to SQLite to API, then durable reuse', async t => {
  const f = fixture(t);
  for (const id of ['simplicity:kiwisaver:high-growth', 'simplicity:investment:high-growth']) {
    const first = await f.make()(request(id), f.env);
    assert.equal(first.status, 200);
    const data = await first.json();
    assert.equal(data.snapshot.seriesId, id);
    assert.equal(data.snapshot.price, 1.25);
    assert.equal(data.snapshot.asOfDate, '2026-11-04');
    assert.equal(data.snapshot.freshness, 'unchecked');
    assert.equal(data.snapshot.alertEligible, false);
    assert.equal(data.snapshot.identityVerified, false);
    assert.equal(data.history.length, 3);
    const cached = await (await f.make()(request(id), f.env)).json();
    assert.equal(cached.cache.state, 'cached');
    assert.equal(cached.snapshot.fetchedAt, data.snapshot.fetchedAt);
  }
  assert.equal(f.calls(), 2);
});
test('malformed CSV never becomes a successful API snapshot', async t => {
  const f = fixture(t, 'Date,Price\n31-02-2026,1.2');
  const response = await f.make()(request('simplicity:kiwisaver:high-growth'), f.env);
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.equal(data.lastSuccessful, null);
  assert.equal(data.cache.state, 'unavailable');
});
