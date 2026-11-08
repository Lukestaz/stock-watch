import { appendFileSync } from 'node:fs';
import { fetchSimplicityHistory } from '../worker/src/simplicity-fetch.mjs';
import { DOWNLOAD_EVIDENCE } from '../worker/src/simplicity-feed-health.mjs';
import { buildFundSnapshot } from '../worker/src/simplicity-snapshot.mjs';

const parts = new Intl.DateTimeFormat('en-NZ', {
  timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit'
}).formatToParts(new Date());
const part = type => parts.find(value => value.type === type).value;
const todayNZ = `${part('year')}-${part('month')}-${part('day')}`;
// No publication schedule is assumed. This optional date is an explicit diagnostic override.
const expectedAsOfDate = process.env.SIMPLICITY_EXPECTED_AS_OF_DATE || null;
const reports = [];
for (const fund of DOWNLOAD_EVIDENCE) {
  const report = { seriesId: fund.seriesId, status: null, contentType: null, bytesRead: 0, parsePassed: false };
  try {
    const result = await fetchSimplicityHistory({
      ...fund,
      // Probe opt-in only; does not update catalogue or identity verification.
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
    // Public launch-price sanity checks, not independent fund identity checks.
    const benchmarks = fund.seriesId.endsWith(':high-growth')
      ? [{ seriesId: fund.seriesId, asOfDate: '2023-05-02', price: 1 }]
      : [];
    Object.assign(report, buildFundSnapshot(result, { todayNZ, expectedAsOfDate, benchmarks }));
    report.parsePassed = true;
  } catch (error) {
    report.error = error.name === 'AbortError' ? 'Request timed out' : String(error.message).slice(0, 200);
  }
  reports.push(report);
}
console.log(JSON.stringify({ schemaVersion: 1, todayNZ, expectedAsOfDate, reports }, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = reports.map(r => `| ${r.seriesId} | ${r.status ?? '-'} | ${r.bytesRead} | ${r.parsePassed ? r.rows : 'FAIL'} | ${r.asOfDate ?? '-'} | ${r.price ?? '-'} | ${r.freshness ?? '-'} | ${(r.benchmarkChecks ?? []).map(b => b.status).join(', ') || 'not configured'} |`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    '## Simplicity public-feed snapshots',
    'Download and sanity checks only. Identity remains unverified; alerts remain disabled. No deployment, database writes or personal portfolio data.',
    '| Series | HTTP | Bytes read | Parsed rows | Observation date | Price | Freshness | Sanity checks |',
    '|---|---|---|---|---|---|---|---|', ...rows, ''
  ].join('\n'));
}
if (reports.some(r => !r.parsePassed || r.freshness === 'future-dated' || r.benchmarkChecks?.some(b => b.status !== 'match'))) process.exitCode = 1;
