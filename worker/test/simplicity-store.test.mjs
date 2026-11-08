import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createSimplicityStore } from '../src/simplicity-store.mjs';
const id = 'simplicity:kiwisaver:high-growth';
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'simplicity-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'test.sqlite');
  const bridge = new URL('../../tests/schema/simplicity_bridge.py', import.meta.url);
  function call(mode, statements = []) {
    const result = spawnSync('python3', [bridge.pathname, file, mode], { input: JSON.stringify(statements), encoding: 'utf8' });
    if (result.status !== 0) throw Error(result.stderr);
    return JSON.parse(result.stdout);
  }
  call('init');
  call('init');
  const db = { prepare: sql => ({ bind: (...args) => ({ sql, args }) }), batch: async statements => call('batch', statements) };
  return () => createSimplicityStore(db);
}
const payload = (price = 1.2) => ({ seriesId: id, fetchedAt: '2026-11-07T10:00:00Z', history: [{ seriesId: id, asOfDate: '2026-11-04', price, currency: 'NZD' }] });

test('persists observations across service instances', async t => {
  const make = fixture(t), first = make();
  assert.equal(await first.claim(id, 'owner-a', 1000), true);
  assert.equal(await first.save(id, 'owner-a', 1001, payload()), true);
  const stored = await make().read(id);
  assert.equal(stored.history[0].price, 1.2);
  assert.equal(stored.state.fetched_at, payload().fetchedAt);
  assert.equal(await make().claim(id, 'owner-b', 1002), false);
});
test('leases coordinate independent instances and fence expired owners', async t => {
  const make = fixture(t), a = make(), b = make();
  assert.equal(await a.claim(id, 'a', 1000), true);
  assert.equal(await b.claim(id, 'b', 1001), false);
  assert.equal(await b.claim(id, 'b', 1091), true);
  assert.equal(await a.save(id, 'a', 1092, payload(9)), false);
  assert.equal(await b.save(id, 'b', 1093, payload(2)), true);
  assert.equal((await a.read(id)).history[0].price, 2);
});
test('failed refresh preserves last success and durable backoff', async t => {
  const make = fixture(t), store = make();
  await store.claim(id, 'a', 1000);
  await store.save(id, 'a', 1001, payload());
  assert.equal(await store.claim(id, 'b', 4602), true);
  await store.fail(id, 'b', 4603);
  const stored = await make().read(id);
  assert.equal(stored.state.checked_at, 1001);
  assert.equal(stored.history[0].price, 1.2);
  assert.equal(await make().claim(id, 'c', 4604), false);
  assert.equal(await make().claim(id, 'c', 4664), true);
});
test('full refresh replaces revised and removed observations atomically', async t => {
  const make = fixture(t), store = make();
  const initial = payload();
  initial.history.push({ ...initial.history[0], asOfDate: '2026-11-03' });
  await store.claim(id, 'a', 1000);
  await store.save(id, 'a', 1001, initial);
  await store.claim(id, 'b', 4602);
  await store.save(id, 'b', 4603, payload(1.3));
  const stored = await make().read(id);
  assert.equal(stored.history.length, 1);
  assert.equal(stored.history[0].price, 1.3);
});
test('malformed payloads and unknown series never write observations', async t => {
  const make = fixture(t), store = make();
  await store.claim(id, 'a', 1000);
  const bad = payload(); bad.history[0].asOfDate = '2026-02-31';
  await assert.rejects(store.save(id, 'a', 1001, bad));
  await assert.rejects(store.claim('unknown', 'a', 1000));
  assert.equal((await store.read(id)).history.length, 0);
});
