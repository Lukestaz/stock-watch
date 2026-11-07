import { assessFundFreshness, checkPriceBenchmark } from './simplicity-feed-health.mjs';

export function buildFundSnapshot(result, { todayNZ, expectedAsOfDate = null, benchmarks = [] } = {}) {
  const { seriesId, history, fetchedAt } = result;
  if (typeof seriesId !== 'string' || !Array.isArray(history) || !history.length || typeof fetchedAt !== 'string' || !Number.isFinite(Date.parse(fetchedAt))) throw new Error('Invalid fetch result');
  const dates = new Set();
  for (const row of history) {
    if (row.seriesId !== seriesId || row.currency !== 'NZD' || !Number.isFinite(row.price) || row.price <= 0 || dates.has(row.asOfDate)) throw new Error('Invalid history observation');
    assessFundFreshness({ asOfDate: row.asOfDate, todayNZ });
    dates.add(row.asOfDate);
  }
  const ordered = [...history].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
  const latest = ordered[ordered.length - 1];
  const benchmarkChecks = benchmarks.map(benchmark => {
    if (benchmark.seriesId !== seriesId) throw new Error('Cross-series benchmark rejected');
    return { asOfDate: benchmark.asOfDate, status: checkPriceBenchmark(history, benchmark) };
  });
  return {
    schemaVersion: 1, seriesId, currency: 'NZD', downloadStatus: 'passed',
    rows: history.length, firstDate: ordered[0].asOfDate,
    asOfDate: latest.asOfDate, price: latest.price, fetchedAt,
    expectedAsOfDate,
    freshness: assessFundFreshness({ asOfDate: latest.asOfDate, todayNZ, expectedAsOfDate }),
    benchmarkChecks, identityVerified: false, alertEligible: false
  };
}
