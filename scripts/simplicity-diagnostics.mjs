import { appendFileSync } from 'node:fs';
import { fetchSimplicityHistory } from '../worker/src/simplicity-fetch.mjs';

// Candidates only: this script does not verify or enable catalogue entries.
const candidates = [
  ['kiwisaver', 'high-growth', 'High Growth'],
  ['kiwisaver', 'growth', 'Growth'],
  ['kiwisaver', 'balanced', 'Balanced'],
  ['kiwisaver', 'default', 'Default'],
  ['kiwisaver', 'conservative', 'Conservative'],
  ['kiwisaver', 'defensive', 'Defensive'],
  ['investment', 'high-growth', 'INVHigh Growth'],
  ['investment', 'growth', 'INVGrowth'],
  ['investment', 'balanced', 'INVBalanced'],
  ['investment', 'conservative', 'INVConservative']
];
const reports = [];
for (const [scheme, slug, parameter] of candidates) {
  const seriesId = `simplicity:${scheme}:${slug}`;
  const url = new URL('https://simplicity.kiwi/api/download_prices');
  url.searchParams.set('fund_name', parameter);
  const report = { seriesId, parameter, status: null, contentType: null, bytesRead: 0, parsePassed: false };
  try {
    const result = await fetchSimplicityHistory({
      seriesId, feedUrl: url.toString(),
      // Local probe opt-in only, never persisted to the catalogue.
      verificationStatus: 'verified'
    }, { fetchImpl: async (input, options) => {
      const response = await fetch(input, options);
      report.status = response.status;
      report.contentType = response.headers.get('content-type');
      report.declaredBytes = response.headers.get('content-length');
      if (!response.body || !response.ok) return response;
      const counted = response.body.pipeThrough(new TransformStream({
        transform(chunk, controller) {
          report.bytesRead += chunk.byteLength;
          controller.enqueue(chunk);
        }
      }));
      return new Response(counted, { status: response.status, headers: response.headers });
    }});
    report.parsePassed = true;
    report.rows = result.history.length;
    report.firstDate = result.history[0].asOfDate;
    report.latestDate = result.latest.asOfDate;
    report.latestPrice = result.latest.price;
    report.fetchedAt = result.fetchedAt;
    report.freshness = result.freshness;
    report.identityVerified = false;
    report.alertEligible = false;
  } catch (error) {
    report.error = error.name === 'AbortError' ? 'Request timed out' : String(error.message).slice(0, 200);
  }
  reports.push(report);
}
console.log(JSON.stringify(reports, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = reports.map(r => `| ${r.seriesId} | ${r.status ?? '-'} | ${r.bytesRead} | ${r.parsePassed ? r.rows : 'FAIL'} | ${r.latestDate ?? '-'} | ${r.latestPrice ?? '-'} |`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    '## Simplicity public-feed probe',
    'Candidate probes only. CSV success does not establish fund identity or freshness. No catalogue updates, deployments, database writes or alerts.',
    '| Series | HTTP | Bytes read | Parsed rows | Latest date | Latest price |',
    '|---|---|---|---|---|---|', ...rows, ''
  ].join('\n'));
}
if (reports.some(r => !r.parsePassed)) process.exitCode = 1;
