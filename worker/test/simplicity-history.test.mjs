import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSimplicityHistory } from '../src/simplicity-history.mjs';

const ks = 'simplicity:kiwisaver:high-growth';
const inv = 'simplicity:investment:high-growth';

test('sorts observations and removes identical duplicates', () => {
  const rows = parseSimplicityHistory('\uFEFFDate,Price\r\n03-11-2026,1.2\r\n02-11-2026,1.3\r\n03-11-2026,1.2\r\n', ks);
  assert.deepEqual(rows.map(row => row.asOfDate), ['2026-11-02', '2026-11-03']);
  assert.equal(rows[1].price, 1.2);
  assert.equal(rows[1].currency, 'NZD');
});

test('keeps series identities separate', () => {
  const csv = 'Date,Price\n02-11-2026,1.2';
  assert.equal(parseSimplicityHistory(csv, ks)[0].seriesId, ks);
  assert.equal(parseSimplicityHistory(csv, inv)[0].seriesId, inv);
  assert.throws(() => parseSimplicityHistory(csv, 'SIMP:HG'));
});

test('rejects malformed, empty and conflicting data', () => {
  for (const csv of [
    'Date,Price',
    '<html>error</html>',
    'Date,Price\n31-02-2026,1.2',
    'Date,Price\n02-11-2026,0',
    'Date,Price\n02-11-2026,-1',
    'Date,Price\n02-11-2026,NaN',
    'Date,Price\n02-11-2026,1.2oops',
    'Date,Price\n02-11-2026,1.2,extra',
    'Date,Price\n02-11-2026,1.2\n02-11-2026,1.3'
  ]) assert.throws(() => parseSimplicityHistory(csv, ks), csv);
});
