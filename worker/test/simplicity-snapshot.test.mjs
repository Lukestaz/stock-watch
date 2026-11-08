import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFundSnapshot } from '../src/simplicity-snapshot.mjs';
const seriesId = 'simplicity:kiwisaver:high-growth';
const row = { seriesId, asOfDate: '2026-11-04', price: 1.2, currency: 'NZD' };
const result = () => ({ seriesId, history: [{ ...row }], fetchedAt: '2026-11-07T10:00:00Z' });
const options = { todayNZ: '2026-11-07' };

test('compact snapshot cannot enable alerts or imply freshness', () => {
  const value = buildFundSnapshot(result(), options);
  assert.equal(value.price, 1.2);
  assert.equal(value.freshness, 'unchecked');
  assert.equal(value.alertEligible, false);
  assert.equal(value.identityVerified, false);
  assert.equal('history' in value, false);
});
test('expected date controls freshness', () => {
  assert.equal(buildFundSnapshot(result(), { ...options, expectedAsOfDate: '2026-11-05' }).freshness, 'stale');
  assert.equal(buildFundSnapshot(result(), { ...options, expectedAsOfDate: row.asOfDate }).freshness, 'current');
});
test('snapshot sorts without mutating source history', () => {
  const input = result();
  input.history.push({ ...row, asOfDate: '2026-11-03', price: 1.1 });
  const value = buildFundSnapshot(input, options);
  assert.equal(value.firstDate, '2026-11-03');
  assert.equal(value.asOfDate, '2026-11-04');
  assert.equal(input.history[0].asOfDate, '2026-11-04');
});
test('benchmark checks remain separate from identity verification', () => {
  const value = buildFundSnapshot(result(), { ...options, benchmarks: [row] });
  assert.equal(value.benchmarkChecks[0].status, 'match');
  assert.equal(value.identityVerified, false);
  assert.throws(() => buildFundSnapshot(result(), { ...options, benchmarks: [{ ...row, seriesId: 'other' }] }));
});
test('rejects malformed, duplicate and mixed-series histories', () => {
  for (const history of [[], [row, row], [{ ...row, seriesId: 'other' }], [{ ...row, price: 0 }], [{ ...row, asOfDate: '2026-02-31' }]]) {
    assert.throws(() => buildFundSnapshot({ ...result(), history }, options));
  }
});
test('future observations remain visibly future-dated', () => {
  const input = result();
  input.history[0].asOfDate = '2026-11-08';
  assert.equal(buildFundSnapshot(input, options).freshness, 'future-dated');
});
