function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function validateFundView(value, seriesId) {
  const s = value?.snapshot;
  if (s?.seriesId !== seriesId || s.currency !== 'NZD' || !validDate(s.asOfDate) || !Number.isFinite(s.price) || s.price <= 0 || typeof s.fetchedAt !== 'string' || !Number.isFinite(Date.parse(s.fetchedAt)) || !Array.isArray(value.history) || !value.history.length) throw Error('Invalid fund response');
  const dates = new Set();
  const history = value.history.map(row => {
    if (!validDate(row.asOfDate) || !Number.isFinite(row.price) || row.price <= 0 || dates.has(row.asOfDate)) throw Error('Invalid price history');
    dates.add(row.asOfDate);
    return { asOfDate: row.asOfDate, price: row.price };
  }).sort((a,b) => a.asOfDate.localeCompare(b.asOfDate));
  const latest = history[history.length - 1];
  if (latest.asOfDate !== s.asOfDate || latest.price !== s.price) throw Error('Snapshot/history mismatch');
  return { snapshot: s, history };
}
export function chartPoints(rows) {
  if (!rows.length) return '';
  const times = rows.map(r => Date.parse(r.asOfDate + 'T00:00:00Z'));
  const prices = rows.map(r => r.price);
  const first = Math.min(...times), span = Math.max(...times) - first || 1;
  const low = Math.min(...prices), height = Math.max(...prices) - low || 1;
  return rows.map((row, i) => `${(20 + 760 * (times[i] - first) / span).toFixed(2)},${(220 - 200 * (row.price - low) / height).toFixed(2)}`).join(' ');
}
