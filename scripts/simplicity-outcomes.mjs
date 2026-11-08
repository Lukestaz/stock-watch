import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CHECKS = ['simplicity', 'accounts', 'ui', 'feeds'];
export function tapCounts(text) {
  const values = {};
  for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped']) {
    const match = text.match(new RegExp('^# ' + key + ' (\\d+)\\s*$', 'm'));
    if (!match || !Number.isSafeInteger(Number(match[1]))) return null;
    values[key] = Number(match[1]);
  }
  return values.tests === values.pass + values.fail + values.cancelled + values.skipped ? values : null;
}
export function summariseChecks(checks, jobResult) {
  const complete = CHECKS.every(name => checks[name]?.status === 'passed');
  if (jobResult === 'failure' || CHECKS.some(name => checks[name]?.status === 'failed')) return 'failed';
  return complete && jobResult === 'success' ? 'passed' : 'incomplete';
}
export function newer(next, previous) {
  return Number(next.runNumber) > Number(previous.runNumber) || (Number(next.runNumber) === Number(previous.runNumber) && Number(next.runAttempt) > Number(previous.runAttempt));
}
function collect(kind, dir) {
  if (!CHECKS.includes(kind)) throw Error('Unsupported check');
  const startedAt = new Date().toISOString();
  const testKind = kind === 'simplicity' || kind === 'accounts';
  const files = testKind ? readdirSync('worker/test').filter(name => name.startsWith(kind === 'accounts' ? 'account-' : 'simplicity-') && name.endsWith('.test.mjs')).sort().map(name => 'worker/test/' + name) : [];
  const args = testKind ? ['--test', ...files] : kind === 'ui' ? ['--check', 'site/simplicity.js'] : ['scripts/simplicity-diagnostics.mjs'];
  if (testKind && !files.length) throw Error('No test files');
  const run = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 180000, maxBuffer: 8388608 });
  process.stdout.write(run.stdout || ''); process.stderr.write(run.stderr || '');
  const record = { schemaVersion: 1, name: kind, startedAt, completedAt: new Date().toISOString(), processExitCode: run.status, status: run.status === 0 ? 'passed' : 'failed' };
  if (testKind) {
    record.counts = tapCounts(run.stdout || '');
    if (!record.counts || record.counts.fail || record.counts.cancelled) record.status = run.status === 0 ? 'unknown' : 'failed';
  }
  if (kind === 'feeds') {
    try {
      const data = JSON.parse(run.stdout);
      if (data.schemaVersion !== 1 || !Array.isArray(data.reports) || data.reports.length !== 10) throw Error('Missing feed reports');
      record.feeds = data.reports.map(r => ({ seriesId: String(r.seriesId).slice(0, 100), httpStatus: Number.isInteger(r.status) ? r.status : null, parsePassed: r.parsePassed === true, asOfDate: /^\d{4}-\d{2}-\d{2}$/.test(r.asOfDate || '') ? r.asOfDate : null }));
      if (record.feeds.some(r => r.httpStatus !== 200 || !r.parsePassed)) record.status = 'failed';
    } catch { record.status = run.status === 0 ? 'unknown' : 'failed'; }
  }
  writeFileSync(join(dir, kind + '.json'), JSON.stringify(record, null, 2) + '\n');
  if (record.status !== 'passed') process.exitCode = 1;
}
function summary(dir) {
  const checks = {};
  for (const name of CHECKS) {
    try {
      const r = JSON.parse(readFileSync(join(dir, name + '.json'), 'utf8'));
      if (r.name !== name || !['passed','failed','unknown'].includes(r.status)) throw Error('Invalid check');
      checks[name] = r;
    } catch { checks[name] = { name, status: 'missing' }; }
  }
  const summary = { schemaVersion: 1, scope: 'simplicity-verification-job', repository: process.env.GITHUB_REPOSITORY, sourceSha: process.env.GITHUB_SHA, sourceRef: process.env.GITHUB_REF, runId: process.env.GITHUB_RUN_ID, runNumber: process.env.GITHUB_RUN_NUMBER, runAttempt: process.env.GITHUB_RUN_ATTEMPT, recordedAt: new Date().toISOString(), jobResult: process.env.TEST_JOB_RESULT, checks, outcome: summariseChecks(checks, process.env.TEST_JOB_RESULT), deployed: false, remoteMigrationApplied: false, alertsActivated: false };
  summary.runUrl = `https://github.com/${summary.repository}/actions/runs/${summary.runId}`;
  writeFileSync(join(dir, 'outcome.json'), JSON.stringify(summary, null, 2) + '\n');
  const lines = ['# Simplicity verification outcome', '', `Result: ${summary.outcome}`, `Source: ${summary.sourceRef} @ ${summary.sourceSha}`, `Run: ${summary.runUrl} (attempt ${summary.runAttempt})`, '', ...CHECKS.map(name => `- ${name}: ${checks[name].status}${checks[name].counts ? ' (' + checks[name].counts.pass + '/' + checks[name].counts.tests + ' passed)' : ''}`), '', 'Scope: verification job only; not the overall workflow or publisher conclusion.', 'No deployment, remote migration or alert activation. Check source SHA and timestamps before treating this as current.', 'Cancelled or infrastructure-aborted runs may not publish a record.', ''];
  writeFileSync(join(dir, 'summary.md'), lines.join('\n'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.env.OUTCOME_DIR;
  if (!dir) throw Error('OUTCOME_DIR required');
  mkdirSync(dir, { recursive: true });
  if (process.argv[2] === 'summary') summary(dir);
  else collect(process.argv[2], dir);
}
