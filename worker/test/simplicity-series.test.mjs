import test from 'node:test';
import assert from 'node:assert/strict';
import { SIMPLICITY_CATALOGUE } from '../src/simplicity-catalogue.mjs';
import { parseSimplicityHistory } from '../src/simplicity-history.mjs';

for (const fund of SIMPLICITY_CATALOGUE) {
  test(`parses ${fund.seriesId} without enabling its feed`, () => {
    const rows = parseSimplicityHistory('Date,Price\n02-11-2026,1.25', fund.seriesId);
    assert.equal(rows[0].seriesId, fund.seriesId);
    assert.equal(rows[0].price, 1.25);
    assert.equal(fund.monitoringEnabled, false);
    assert.equal(fund.alertsEnabled, false);
  });
}

test('rejects unknown and ambiguous series', () => {
  for (const id of ['SIMP:HG', 'simplicity:investment:default', '', undefined]) {
    assert.throws(() => parseSimplicityHistory('Date,Price\n02-11-2026,1.25', id));
  }
});

test('retains date, price and duplicate validation', () => {
  const id = 'simplicity:kiwisaver:defensive';
  const rows = parseSimplicityHistory('\uFEFFDate,Price\r\n03-11-2026,1.2\r\n02-11-2026,1.3\r\n03-11-2026,1.2', id);
  assert.deepEqual(rows.map(row => row.asOfDate), ['2026-11-02', '2026-11-03']);
  for (const text of ['Date,Price', 'Date,Price\n31-02-2026,1.2', 'Date,Price\n02-11-2026,0', 'Date,Price\n02-11-2026,NaN', 'Date,Price\n02-11-2026,1.2oops', 'Date,Price\n02-11-2026,1.2\n02-11-2026,1.3']) {
    assert.throws(() => parseSimplicityHistory(text, id));
  }
});
