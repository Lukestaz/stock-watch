import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, execFileSync} from 'node:child_process';
import {createPriceCache, PriceCacheError, quoteTtl} from '../src/price-cache.mjs';
import {createAlpacaLoader} from '../src/price-cache-alpaca.mjs';
globalThis.crypto ??= webcrypto;
const bridge = fileURLToPath(new URL('../../tests/schema/price_cache_bridge.py', import.meta.url));
const initial = 1700000000;
const payload = (kind, price = 10) => ({dataCutoff: new Date((initial - 960) * 1000).toISOString(),
  ...(kind === 'history' ? {history: [{t: '2023-11-13T05:00:00Z', c: price, l: price - 1}]} :
    {price, time: '2023-11-13T20:00:00Z'})});
const query = (db, sql, args = []) => db.batch([db.prepare(sql).bind(...args)]).then(r => r[0].results);
function fixture(t, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'price-cache-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const file = join(dir, 'test.sqlite'); execFileSync('python3', [bridge, file, 'init']);
  let time = initial, implementation, calls = [];
  const db = {prepare: sql => ({bind: (...args) => ({sql, args})}), batch: statements => new Promise((resolve, reject) => {
    const child = spawn('python3', [bridge, file, 'batch']); let out = '', err = '';
    child.stdout.on('data', d => out += d); child.stderr.on('data', d => err += d);
    child.on('error', reject); child.stdin.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(Error(err));
      try { resolve(JSON.parse(out)); } catch (e) { reject(e); }
    });
    child.stdin.end(JSON.stringify(statements));
  })};
  const config = {db, clock: () => time, latestTtl: () => 300, ...overrides,
    load: async (kind, symbol, {beforeRequest}) => {
      await beforeRequest(); calls.push([kind, symbol]);
      return implementation ? implementation(kind, symbol) : payload(kind);
    }};
  return {db, config, cache: createPriceCache(config), calls, advance: seconds => time += seconds,
    now: () => time, set: fn => implementation = fn};
}
function gate() {
  let enter, release;
  return {entered: new Promise(r => {enter = r;}), wait: new Promise(r => {release = r;}), enter: () => enter(), release: () => release()};
}

test('cold get persists two parts; fresh reads are shared across cache instances', async t => {
  const f = fixture(t), first = await f.cache.get(' aapl ');
  assert.equal(first.symbol, 'AAPL'); assert.equal(first.price, 10); assert.equal(first.history.length, 1);
  assert.equal(f.calls.length, 2);
  const second = await createPriceCache(f.config).get('AAPL');
  assert.equal(second.cache.history.state, 'fresh'); assert.equal(second.cache.latest.state, 'fresh');
  assert.equal(f.calls.length, 2);
  assert.equal((await query(f.db, 'SELECT count(*) AS n FROM price_cache_entries'))[0].n, 2);
});

test('latest refreshes independently while history remains fresh for a day', async t => {
  const f = fixture(t); await f.cache.get('AAPL'); f.advance(301); f.set(kind => payload(kind, 12));
  const result = await f.cache.get('AAPL');
  assert.equal(result.price, 12); assert.equal(result.history[0].c, 10);
  assert.equal(f.calls.filter(([kind]) => kind === 'history').length, 1);
  f.advance(86400); await f.cache.get('AAPL');
  assert.equal(f.calls.filter(([kind]) => kind === 'history').length, 2);
});

test('database lease prevents duplicate cold refresh across instances', async t => {
  const f = fixture(t), g = gate();
  f.set(async kind => {g.enter(); await g.wait; return payload(kind);});
  const first = f.cache.read('AAPL', 'latest'); await g.entered;
  await assert.rejects(createPriceCache(f.config).read('AAPL', 'latest'), e => e instanceof PriceCacheError && e.code === 'busy-or-capacity');
  assert.equal(f.calls.length, 1); g.release(); await first;
});

test('stale readers do not duplicate an in-flight refresh', async t => {
  const f = fixture(t); await f.cache.read('AAPL', 'latest'); f.advance(301);
  const g = gate(); f.set(async kind => {g.enter(); await g.wait; return payload(kind, 12);});
  const first = f.cache.read('AAPL', 'latest'); await g.entered;
  const second = await createPriceCache(f.config).read('AAPL', 'latest');
  assert.equal(second.data.price, 10); assert.equal(second.state, 'stale'); assert.equal(second.reason, 'refresh-in-progress');
  g.release(); assert.equal((await first).data.price, 12); assert.equal(f.calls.length, 2);
});

test('expired lease owner cannot overwrite a newer refresh', async t => {
  const f = fixture(t), g = gate();
  f.set(async kind => {g.enter(); await g.wait; return payload(kind, 11);});
  const old = f.cache.read('AAPL', 'latest'); await g.entered; f.advance(91);
  f.set(kind => payload(kind, 22));
  assert.equal((await createPriceCache(f.config).read('AAPL', 'latest')).data.price, 22);
  g.release(); assert.equal((await old).data.price, 22);
  assert.equal((await f.cache.read('AAPL', 'latest')).data.price, 22);
});

test('provider failure preserves stale data and suppresses repeated fetches', async t => {
  const f = fixture(t), first = await f.cache.read('AAPL', 'latest'); f.advance(301);
  f.set(() => {throw Error('private provider detail');});
  const stale = await f.cache.read('AAPL', 'latest');
  assert.equal(stale.state, 'stale'); assert.equal(stale.checkedAt, first.checkedAt);
  assert.equal(stale.data.price, 10); assert.equal(stale.reason, 'provider-unavailable');
  await f.cache.read('AAPL', 'latest'); assert.equal(f.calls.length, 2);
  f.advance(7 * 86400); await assert.rejects(f.cache.read('AAPL', 'latest'), PriceCacheError);
});

test('cold failures are backed off and do not expose provider errors', async t => {
  const f = fixture(t); f.set(() => {throw Error('secret API credential');});
  await assert.rejects(f.cache.read('BAD', 'latest'), e => e instanceof PriceCacheError && !e.message.includes('credential'));
  await assert.rejects(f.cache.read('BAD', 'latest'), e => e.code === 'backoff'); assert.equal(f.calls.length, 1);
  f.advance(31); await assert.rejects(f.cache.read('BAD', 'latest')); assert.equal(f.calls.length, 2);
});

test('shared minute and UTC-day budgets count actual provider attempts', async t => {
  const f = fixture(t, {dailyLimit: 2, minuteLimit: 1});
  await f.cache.read('A', 'latest');
  await assert.rejects(createPriceCache(f.config).read('B', 'latest'), e => e.code === 'budget');
  assert.equal(f.calls.length, 1); f.advance(61); await f.cache.read('B', 'latest');
  f.advance(61); await assert.rejects(f.cache.read('C', 'latest'), e => e.code === 'budget');
  assert.equal(f.calls.length, 2);
  f.advance(86400); await f.cache.read('C', 'latest'); assert.equal(f.calls.length, 3);
});

test('concurrent different symbols cannot overspend the shared provider budget', async t => {
  const f = fixture(t, {minuteLimit: 1});
  const results = await Promise.allSettled([f.cache.read('A', 'latest'), createPriceCache(f.config).read('B', 'latest')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.calls.length, 1);
});

test('provider 429 cooldown applies to other symbols', async t => {
  const f = fixture(t); f.set(() => {throw new PriceCacheError('rate-limit', f.now() + 180);});
  await assert.rejects(f.cache.read('A', 'latest'), e => e.code === 'rate-limit');
  f.set(kind => payload(kind));
  await assert.rejects(f.cache.read('B', 'latest'), e => e.code === 'budget'); assert.equal(f.calls.length, 1);
  f.advance(181); await f.cache.read('B', 'latest'); assert.equal(f.calls.length, 2);
});

test('invalid data never replaces a valid snapshot', async t => {
  const f = fixture(t); await f.cache.read('A', 'latest'); f.advance(301);
  f.set(() => ({price: -1, time: 'bad', dataCutoff: 'bad'}));
  const stale = await f.cache.read('A', 'latest'); assert.equal(stale.data.price, 10); assert.equal(stale.state, 'stale');
});

test('entry admission is bounded and expired negative entries can be cleaned', async t => {
  const f = fixture(t, {maxEntries: 1}); f.set(() => {throw new PriceCacheError('not-found');});
  await assert.rejects(f.cache.read('BAD', 'latest'));
  await assert.rejects(f.cache.read('A', 'latest'), e => e.code === 'busy-or-capacity');
  assert.equal(f.calls.length, 1); f.advance(31); await f.cache.cleanup();
  f.set(kind => payload(kind)); assert.equal((await f.cache.read('A', 'latest')).data.price, 10);
});

test('invalid symbols fail before storage or provider access; NY schedule is conservative', async t => {
  const f = fixture(t);
  for (const value of ['', '-A', 'A/B', 'A'.repeat(16)]) await assert.rejects(f.cache.read(value, 'latest'));
  assert.equal(f.calls.length, 0);
  assert.equal(quoteTtl(Date.parse('2026-10-19T15:00:00Z') / 1000), 300);
  assert.equal(quoteTtl(Date.parse('2026-10-18T15:00:00Z') / 1000), 3600);
  assert.equal(quoteTtl(Date.parse('2026-10-19T23:00:00Z') / 1000), 3600);
});

test('Alpaca loader charges each history page and uses split versus raw adjustments', async () => {
  let charges = 0; const urls = [];
  const load = createAlpacaLoader({key: 'fixture', secret: 'fixture', clock: () => initial,
    fetcher: async (url, options) => {
      urls.push(new URL(url)); assert.equal(options.redirect, 'error');
      return Response.json({bars: [{t: '2023-11-13T20:00:00Z', c: 10, l: 9}],
        next_page_token: urls.length === 1 ? 'next' : null});
    }});
  assert.equal((await load('history', 'AAPL', {beforeRequest: async () => {charges++;}})).history.length, 2);
  assert.equal(charges, 2); assert.equal(urls[0].searchParams.get('adjustment'), 'split');
  assert.equal(urls[1].searchParams.get('page_token'), 'next');
  await load('latest', 'AAPL', {beforeRequest: async () => {charges++;}});
  assert.equal(charges, 3); assert.equal(urls[2].searchParams.get('adjustment'), 'raw');
});

test('latest loader intentionally ignores further pages after the newest bar', async () => {
  let calls = 0;
  const load = createAlpacaLoader({key: 'fixture', secret: 'fixture', clock: () => initial,
    fetcher: async () => {calls++; return Response.json({bars: [{t: '2023-11-13T20:00:00Z', c: 10, l: 9}], next_page_token: 'more'});}});
  assert.equal((await load('latest', 'A', {beforeRequest: async () => {}})).price, 10); assert.equal(calls, 1);
});

test('loader honours retry hints and bounds pagination and response bodies', async () => {
  const config = {key: 'fixture', secret: 'fixture', clock: () => initial};
  const limited = createAlpacaLoader({...config, fetcher: async () => new Response('private', {status: 429, headers: {'Retry-After': '120'}})});
  await assert.rejects(limited('latest', 'A', {beforeRequest: async () => {}}), e => e.code === 'rate-limit' && e.retryAt === initial + 120);
  let calls = 0;
  const pages = createAlpacaLoader({...config, fetcher: async () => {calls++; return Response.json({bars: [], next_page_token: 'more'});}});
  await assert.rejects(pages('history', 'A', {beforeRequest: async () => {}})); assert.equal(calls, 3);
  const large = createAlpacaLoader({...config, fetcher: async () => new Response(' '.repeat(2000001))});
  await assert.rejects(large('latest', 'A', {beforeRequest: async () => {}}));
});
