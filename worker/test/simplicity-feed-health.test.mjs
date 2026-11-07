import test from 'node:test';
import assert from 'node:assert/strict';
import { DOWNLOAD_EVIDENCE, assessFundFreshness, checkPriceBenchmark } from '../src/simplicity-feed-health.mjs';

test('ten evidenced endpoints remain disabled and identity-unverified', () => {
  assert.equal(DOWNLOAD_EVIDENCE.length, 10);
  assert.equal(new Set(DOWNLOAD_EVIDENCE.map(f => f.seriesId)).size, 10);
  for (const fund of DOWNLOAD_EVIDENCE) {
    assert.ok(Object.isFrozen(fund));
    assert.equal(fund.identityVerified, false);
    assert.equal(fund.monitoringEnabled, false);
    assert.equal(fund.alertsEnabled, false);
    assert.equal(new URL(fund.feedUrl).origin, 'https://simplicity.kiwi');
  }
});

test('Investment names retain their exact parameters', () => {
  const fund = DOWNLOAD_EVIDENCE.find(f => f.seriesId === 'simplicity:investment:high-growth');
  assert.equal(new URL(fund.feedUrl).searchParams.get('fund_name'), 'INVHigh Growth');
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
