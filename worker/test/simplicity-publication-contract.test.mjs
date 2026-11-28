import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFundSnapshot } from '../src/simplicity-snapshot.mjs';
import { publicationContext } from '../../site/simplicity-view.mjs';

const seriesId = 'simplicity:investment:high-growth';
const result = {
  seriesId, fetchedAt: '2026-11-24T03:00:00Z',
  history: [{ seriesId, currency: 'NZD', asOfDate: '2026-11-19', price: 1.6052 }]
};
const options = { todayNZ: '2026-11-24', expectedAsOfDate: '2026-11-19' };

test('snapshot current status maps to the configured-date UI label without claiming verification', () => {
  const snapshot = buildFundSnapshot(result, options);
  const model = publicationContext(snapshot, 'refreshed');
  assert.equal(snapshot.freshness, 'current');
  assert.match(model.publication, /Meets the configured expected date/);
  assert.match(model.publication, /not independently verified/);
  assert.equal(model.warning, false);
  assert.equal(model.estimateAvailable, false);
  assert.equal(snapshot.alertEligible, false);
});

test('a current observation does not hide a source-refresh failure', () => {
  const model = publicationContext(buildFundSnapshot(result, options), 'stale');
  assert.match(model.publication, /Meets the configured expected date/);
  assert.match(model.source, /Source refresh unavailable/);
  assert.equal(model.warning, true);
  assert.equal(model.estimateAvailable, false);
});

test('restored retrieval of an old valuation remains behind the expected date', () => {
  const model = publicationContext(buildFundSnapshot(result, { ...options, expectedAsOfDate: '2026-11-20' }), 'refreshed');
  assert.equal(model.publication, 'Behind the configured expected date');
  assert.match(model.source, /does not prove/);
  assert.equal(model.warning, true);
});

test('without a configured expected date a successful retrieval remains unchecked', () => {
  const snapshot = buildFundSnapshot(result, { todayNZ: options.todayNZ });
  assert.equal(snapshot.freshness, 'unchecked');
  assert.equal(publicationContext(snapshot, 'refreshed').publication, 'Not independently verified');
});
