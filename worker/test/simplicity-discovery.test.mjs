import test from 'node:test';
import assert from 'node:assert/strict';
import { discover, metadata, PRODUCTION_DB } from '../../scripts/simplicity-discovery.mjs';
const preview = '11111111-1111-4111-8111-111111111111';
test('filters unrelated metadata, strips secret/plaintext values, never certifies isolation', async () => {
  const report = await discover(async path => {
    if (path.startsWith('/d1/')) return { result: [{ name: 'stock-watch', uuid: PRODUCTION_DB }, { name: 'simplicity-preview', uuid: preview }, { name: 'unrelated-private', uuid: preview }], result_info: { total_count: 3 } };
    if (path === '/workers/scripts') return { result: [{ id: 'simplicity-preview' }, { id: 'unrelated-private' }] };
    return { result: { bindings: [{ name: 'DB', type: 'd1', id: PRODUCTION_DB }, { name: 'PASSWORD', type: 'plain_text', text: 'SECRET-CANARY' }, { name: 'TOKEN', type: 'secret_text', text: 'SECRET-CANARY' }, { name: 'API', type: 'service', service: 'stock-watch-prices' }] } };
  });
  assert.equal(report.complete, true);
  assert.equal(report.databases.length, 2);
  assert.match(report.workers[0].classification, /production-bound/);
  assert.equal(report.isolationVerified, false);
  assert.doesNotMatch(JSON.stringify(report), /SECRET-CANARY|PASSWORD|TOKEN|unrelated-private/);
});
test('permission failures remain incomplete and suppress raw provider errors', async () => {
  const report = await discover(async () => { throw Error('SECRET-CANARY'); });
  assert.equal(report.complete, false);
  assert.doesNotMatch(JSON.stringify(report), /SECRET-CANARY/);
});
test('bounded pagination does not claim complete inventory', async () => {
  let pages = 0;
  const report = await discover(async path => path.startsWith('/d1/') ? (pages++, { result: Array.from({ length: 100 }, () => ({ name: 'unrelated' })), result_info: { total_count: 1000 } }) : { result: [] });
  assert.equal(pages, 5);
  assert.equal(report.complete, false);
});
test('worker settings failures do not imply a safe target', async () => {
  const report = await discover(async path => {
    if (path.startsWith('/d1/')) return { result: [] };
    if (path === '/workers/scripts') return { result: [{ id: 'simplicity-preview' }] };
    throw Error('SECRET-CANARY');
  });
  assert.equal(report.complete, false);
  assert.equal(report.workers[0].settingsRead, false);
  assert.equal(report.isolationVerified, false);
});
test('network helper only permits bounded metadata GETs without redirects', async () => {
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++; assert.match(url, /^https:\/\/api.cloudflare.com\/client\/v4\/accounts\//);
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify({ success: true, result: [] }));
  };
  await metadata('/workers/scripts', { token: 'synthetic', fetchImpl });
  await assert.rejects(metadata('/d1/database/anything/query', { token: 'synthetic', fetchImpl }));
  await assert.rejects(metadata('/d1/database?page=6&per_page=100', { token: 'synthetic', fetchImpl }));
  assert.equal(calls, 1);
});
