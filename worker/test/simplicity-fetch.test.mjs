import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchSimplicityHistory } from '../src/simplicity-fetch.mjs';

const fund = { seriesId: 'simplicity:kiwisaver:high-growth', verificationStatus: 'verified', feedUrl: 'https://simplicity.kiwi/api/download_prices?fund_name=High%20Growth' };

test('fetch timestamp never implies observation freshness', async () => {
  const result = await fetchSimplicityHistory(fund, {
    fetchImpl: async (url, options) => {
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal);
      return new Response('Date,Price\n02-11-2026,1.25', { headers: { 'content-type': 'text/csv' } });
    },
    now: () => new Date('2026-11-07T09:00:00Z')
  });
  assert.equal(result.latest.asOfDate, '2026-11-02');
  assert.equal(result.fetchedAt, '2026-11-07T09:00:00.000Z');
  assert.equal(result.freshness, 'unchecked');
  assert.equal(result.alertEligible, false);
});

test('rejects unverified mappings and foreign hosts before fetching', async () => {
  const fetchImpl = async () => { throw new Error('Must not fetch'); };
  await assert.rejects(fetchSimplicityHistory({ ...fund, verificationStatus: 'unverified' }, { fetchImpl }), /Verified/);
  await assert.rejects(fetchSimplicityHistory({ ...fund, feedUrl: 'https://example.com/api/download_prices?fund_name=Growth' }, { fetchImpl }), /Invalid feed/);
});

test('rejects HTTP failures, HTML, malformed and oversized bodies', async () => {
  for (const response of [
    new Response('unavailable', { status: 503 }),
    new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } }),
    new Response('Date,Price\n31-02-2026,1.2'),
    new Response('x'.repeat(2000001))
  ]) {
    await assert.rejects(fetchSimplicityHistory(fund, { fetchImpl: async () => response }));
  }
});
