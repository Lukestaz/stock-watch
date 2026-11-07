import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFundView, chartPoints } from '../../site/simplicity-view.mjs';
const id = 'simplicity:kiwisaver:high-growth';
const value = () => ({ snapshot: { seriesId: id, currency: 'NZD', asOfDate: '2026-11-04', price: 1.2, fetchedAt: '2026-11-07T10:00:00Z' }, history: [{ asOfDate: '2026-11-04', price: 1.2 }] });
test('accepts matching public history and snapshot', () => assert.equal(validateFundView(value(), id).history.length, 1));
test('rejects cross-scheme snapshots', () => assert.throws(() => validateFundView(value(), 'simplicity:investment:high-growth')));
test('rejects mismatched or malformed prices', () => {
  const a = value(); a.history[0].price = 1.3;
  assert.throws(() => validateFundView(a, id));
  const b = value(); b.history[0].asOfDate = '2026-02-31';
  assert.throws(() => validateFundView(b, id));
});
test('handles single-point and flat charts without NaN', () => {
  assert.equal(chartPoints([]), '');
  assert.ok(!/NaN|Infinity/.test(chartPoints(value().history)));
  assert.ok(!/NaN|Infinity/.test(chartPoints([{ asOfDate: '2026-11-03', price: 1.2 }, ...value().history])));
});
