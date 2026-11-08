const candidates = [
  ['kiwisaver', 'high-growth', 'High Growth'], ['kiwisaver', 'growth', 'Growth'],
  ['kiwisaver', 'balanced', 'Balanced'], ['kiwisaver', 'default', 'Default'],
  ['kiwisaver', 'conservative', 'Conservative'], ['kiwisaver', 'defensive', 'Defensive'],
  ['investment', 'high-growth', 'INVHigh Growth'], ['investment', 'growth', 'INVGrowth'],
  ['investment', 'balanced', 'INVBalanced'], ['investment', 'conservative', 'INVConservative']
];

export const DOWNLOAD_EVIDENCE = Object.freeze(candidates.map(([scheme, slug, parameter]) => Object.freeze({
  seriesId: `simplicity:${scheme}:${slug}`,
  feedUrl: `https://simplicity.kiwi/api/download_prices?fund_name=${encodeURIComponent(parameter)}`,
  downloadStatus: 'passed', evidenceSource: 'user-supplied Actions output',
  evidenceDate: '2026-11-07', observedLatestDate: '2026-11-04',
  identityVerified: false, monitoringEnabled: false, alertsEnabled: false
})));

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function assessFundFreshness({ asOfDate, todayNZ, expectedAsOfDate = null }) {
  if (!validDate(asOfDate) || !validDate(todayNZ) || (expectedAsOfDate !== null && !validDate(expectedAsOfDate))) throw new Error('Valid ISO calendar dates required');
  if (expectedAsOfDate !== null && expectedAsOfDate > todayNZ) throw new Error('Expected publication date cannot be in the future');
  if (asOfDate > todayNZ) return 'future-dated';
  if (expectedAsOfDate === null) return 'unchecked';
  return asOfDate < expectedAsOfDate ? 'stale' : 'current';
}

export function checkPriceBenchmark(history, { seriesId, asOfDate, price, tolerance = 0.00005 }) {
  if (!Array.isArray(history) || !seriesId || !validDate(asOfDate) || !Number.isFinite(price) || price <= 0 || !Number.isFinite(tolerance) || tolerance < 0) throw new Error('Invalid benchmark');
  const rows = history.filter(row => row.seriesId === seriesId && row.asOfDate === asOfDate);
  if (!rows.length) return 'missing';
  if (rows.length !== 1 || !Number.isFinite(rows[0].price) || rows[0].price <= 0) throw new Error('Invalid or duplicate benchmark observation');
  return Math.abs(rows[0].price - price) <= tolerance ? 'match' : 'mismatch';
}
