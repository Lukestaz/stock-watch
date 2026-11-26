const FEED_ORIGIN = 'https://d1g0vrcwq8cgqg.cloudfront.net';

// Explicit series-to-file mapping from the owner-supplied "Download unit price history" links.
// File names are irregular (for example invnzcash but nzbond) and must never be derived from fund names.
const candidates = [
  ['kiwisaver', 'high-growth', 'highgrowth'], ['kiwisaver', 'growth', 'growth'],
  ['kiwisaver', 'balanced', 'balanced'], ['kiwisaver', 'default', 'default'],
  ['kiwisaver', 'conservative', 'conservative'], ['kiwisaver', 'defensive', 'defensive'],
  ['investment', 'high-growth', 'invhighgrowth'], ['investment', 'growth', 'invgrowth'],
  ['investment', 'balanced', 'invbalanced'], ['investment', 'conservative', 'invconservative'],
  ['investment', 'nz-share', 'nzshare'], ['investment', 'nz-bond', 'nzbond'],
  ['investment', 'nz-cash', 'invnzcash'], ['investment', 'hedged-global-share', 'invhedgedglobalshare'],
  ['investment', 'unhedged-global-share', 'invunhedgedglobalshare'], ['investment', 'hedged-global-bond', 'invhedgedglobalbond']
];

export const DOWNLOAD_EVIDENCE = Object.freeze(candidates.map(([scheme, slug, file]) => Object.freeze({
  seriesId: `simplicity:${scheme}:${slug}`,
  feedUrl: `${FEED_ORIGIN}/unit-prices/${file}.csv`,
  downloadStatus: 'unverified',
  evidenceSource: 'owner-supplied links under the Simplicity "Download unit price history" buttons',
  evidenceDate: '2026-11-26', observedLatestDate: null,
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
