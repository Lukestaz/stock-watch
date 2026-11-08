import test from 'node:test';
import assert from 'node:assert/strict';
import { SIMPLICITY_CATALOGUE, getSimplicityFund } from '../src/simplicity-catalogue.mjs';

test('catalogues contain six KiwiSaver and eleven Investment funds', () => {
  assert.equal(SIMPLICITY_CATALOGUE.filter(f => f.scheme === 'kiwisaver').length, 6);
  assert.equal(SIMPLICITY_CATALOGUE.filter(f => f.scheme === 'investment').length, 11);
  assert.equal(new Set(SIMPLICITY_CATALOGUE.map(f => f.seriesId)).size, 17);
});

test('unverified entries cannot enable monitoring or alerts', () => {
  for (const fund of SIMPLICITY_CATALOGUE) {
    assert.equal(fund.feedUrl, null);
    assert.equal(fund.verificationStatus, 'unverified');
    assert.equal(fund.monitoringEnabled, false);
    assert.equal(fund.alertsEnabled, false);
    assert.ok(Object.isFrozen(fund));
  }
  assert.ok(Object.isFrozen(SIMPLICITY_CATALOGUE));
});

test('lookup never conflates account schemes', () => {
  const ks = getSimplicityFund('simplicity:kiwisaver:high-growth');
  const inv = getSimplicityFund('simplicity:investment:high-growth');
  assert.notEqual(ks.seriesId, inv.seriesId);
  assert.equal(getSimplicityFund('SIMP:HG'), null);
  assert.equal(getSimplicityFund('simplicity:investment:default'), null);
});
