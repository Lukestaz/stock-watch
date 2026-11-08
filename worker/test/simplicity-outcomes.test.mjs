import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS, tapCounts, summariseChecks, newer } from '../../scripts/simplicity-outcomes.mjs';
const tap = '# tests 3\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 1\n';
test('extracts complete TAP totals including skipped tests', () => assert.equal(tapCounts(tap).skipped, 1));
test('missing or inconsistent TAP totals are not success evidence', () => {
  assert.equal(tapCounts(''), null);
  assert.equal(tapCounts(tap.replace('# tests 3', '# tests 9')), null);
});
test('all checks and successful job are required', () => {
  const checks = Object.fromEntries(CHECKS.map(name => [name, { status: 'passed' }]));
  assert.equal(summariseChecks(checks, 'success'), 'passed');
  assert.equal(summariseChecks(checks, 'cancelled'), 'incomplete');
  delete checks.feeds;
  assert.equal(summariseChecks(checks, 'success'), 'incomplete');
});
test('failed checks cannot be hidden by other passes', () => assert.equal(summariseChecks({ ui: { status: 'failed' } }, 'success'), 'failed'));
test('older runs and attempts cannot replace newer results', () => {
  assert.equal(newer({ runNumber: '2', runAttempt: '1' }, { runNumber: '3', runAttempt: '1' }), false);
  assert.equal(newer({ runNumber: '3', runAttempt: '2' }, { runNumber: '3', runAttempt: '1' }), true);
  assert.equal(newer({ runNumber: '3', runAttempt: '1' }, { runNumber: '3', runAttempt: '1' }), false);
});
