import test from 'node:test';
import assert from 'node:assert/strict';
import { DOWNLOAD_EVIDENCE, assessFundFreshness, checkPriceBenchmark } from '../src/simplicity-feed-health.mjs';
import { fetchSimplicityHistory } from '../src/simplicity-fetch.mjs';
import { SIMPLICITY_CATALOGUE } from '../src/simplicity-catalogue.mjs';

const ORIGIN = 'https://d1g0vrcwq8cgqg.cloudfront.net';

test('sixteen evidenced endpoints remain disabled, unverified and identity-unverified', () => {
  assert.equal(DOWNLOAD_EVIDENCE.length, 16);
  assert.equal(new Set(DOWNLOAD_EVIDENCE.map(f => f.seriesId)).size, 16);
  assert.equal(new Set(DOWNLOAD_EVIDENCE.map(f => f.feedUrl)).size, 16);
  for (const fund of DOWNLOAD_EVIDENCE) {
    assert.ok(Object.isFrozen(fund));
    assert.equal(fund.identityVerified, false);
    assert.equal(fund.monitoringEnabled, false);
    assert.equal(fund.alertsEnabled, false);
    assert.equal(fund.downloadStatus, 'unverified');
    const url = new URL(fund.feedUrl);
    assert.equal(url.origin, ORIGIN);
    assert.match(url.pathname, /^\/unit-prices\/[a-z]+\.csv$/);
    assert.equal(url.search, '');
    assert.ok(SIMPLICITY_CATALOGUE.some(item => item.seriesId === fund.seriesId));
  }
});

test('series-to-file mapping is explicit and keeps schemes apart', () => {
  const file = id => new URL(DOWNLOAD_EVIDENCE.find(f => f.seriesId === id).feedUrl).pathname;
  const expected = {
    'simplicity:kiwisaver:high-growth': 'highgrowth', 'simplicity:investment:high-growth': 'invhighgrowth',
    'simplicity:kiwisaver:growth': 'growth', 'simplicity:investment:growth': 'invgrowth',
    'simplicity:kiwisaver:balanced': 'balanced', 'simplicity:investment:balanced': 'invbalanced',
    'simplicity:kiwisaver:conservative': 'conservative', 'simplicity:investment:conservative': 'invconservative',
    'simplicity:kiwisaver:default': 'default', 'simplicity:kiwisaver:defensive': 'defensive',
    'simplicity:investment:nz-share': 'nzshare', 'simplicity:investment:nz-bond': 'nzbond',
    'simplicity:investment:nz-cash': 'invnzcash', 'simplicity:investment:hedged-global-share': 'invhedgedglobalshare',
    'simplicity:investment:unhedged-global-share': 'invunhedgedglobalshare', 'simplicity:investment:hedged-global-bond': 'invhedgedglobalbond'
  };
  assert.equal(Object.keys(expected).length, 16);
  for (const [id, name] of Object.entries(expected)) assert.equal(file(id), `/unit-prices/${name}.csv`);
});

test('Homes and Income has no download link and stays out of the feed list', () => {
  assert.ok(SIMPLICITY_CATALOGUE.some(f => f.seriesId === 'simplicity:investment:homes-and-income'));
  assert.ok(!DOWNLOAD_EVIDENCE.some(f => f.seriesId === 'simplicity:investment:homes-and-income'));
});

test('every configured feed URL is accepted by the fetcher and requested exactly', async () => {
  const csv = 'Date,Price\n02-05-2023,1\n';
  for (const fund of DOWNLOAD_EVIDENCE) {
    let requested = null;
    const result = await fetchSimplicityHistory({ ...fund, verificationStatus: 'verified' }, {
      fetchImpl: async url => { requested = url; return new Response(csv, { headers: { 'content-type': 'text/csv' } }); }
    });
    assert.equal(requested, fund.feedUrl);
    assert.equal(result.seriesId, fund.seriesId);
  }
});

test('no guessed publication schedule', () => {
  assert.equal(assessFundFreshness({ asOfDate: '2026-11-04', todayNZ: '2026-11-07' }), 'unchecked');
});

test('freshness follows explicit expected date, not fetch time', () => {
  const input = { asOfDate: '2026-11-04', todayNZ: '2026-11-07' };
  assert.equal(assessFundFreshness({ ...input, expectedAsOfDate: '2026-11-04' }), 'current');
  assert.equal(assessFundFreshness({ ...input, expectedAsOfDate: '2026-11-05' }), 'stale');
  assert.equal(assessFundFreshness({ ...input, asOfDate: '2026-11-08' }), 'future-dated');
});

test('invalid dates and future publication expectations fail closed', () => {
  assert.throws(() => assessFundFreshness({ asOfDate: '2026-02-31', todayNZ: '2026-11-07' }));
  assert.throws(() => assessFundFreshness({ asOfDate: '2026-11-04', todayNZ: '2026-11-07', expectedAsOfDate: '2026-11-08' }));
});

test('benchmark checks cannot cross schemes', () => {
  const history = [{ seriesId: 'test:ks', asOfDate: '2026-11-02', price: 1.2 }];
  const benchmark = { seriesId: 'test:ks', asOfDate: '2026-11-02', price: 1.2 };
  assert.equal(checkPriceBenchmark(history, benchmark), 'match');
  assert.equal(checkPriceBenchmark(history, { ...benchmark, price: 1.3 }), 'mismatch');
  assert.equal(checkPriceBenchmark(history, { ...benchmark, seriesId: 'test:inv' }), 'missing');
});

test('ambiguous or malformed benchmark data is rejected', () => {
  const row = { seriesId: 'test:ks', asOfDate: '2026-11-02', price: 1.2 };
  assert.throws(() => checkPriceBenchmark([row, row], row));
  assert.throws(() => checkPriceBenchmark([row], { ...row, tolerance: -1 }));
});
