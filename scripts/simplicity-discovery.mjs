import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export const ACCOUNT = 'c4814713eafd41ae857b9a8097610df6';
export const PRODUCTION_DB = '4cb54afc-8f2d-4f62-8b6b-7d59f343b938';
const project = name => typeof name === 'string' && /^(stock-watch|simplicity)(-|$)/.test(name) && /^[a-zA-Z0-9_-]{1,63}$/.test(name);
const uuid = id => typeof id === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id);
export async function metadata(path, { token, fetchImpl = fetch } = {}) {
  if (!token || !(/^\/d1\/database\?page=[1-5]&per_page=100$/.test(path) || path === '/workers/scripts' || /^\/workers\/scripts\/[a-zA-Z0-9_-]{1,63}\/settings$/.test(path))) throw Error('Metadata request refused');
  const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}${path}`, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!response.ok || !response.body) throw Error('Metadata request failed');
  const reader = response.body.getReader(); let text = '', bytes = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break;
      bytes += item.value.byteLength; if (bytes > 2000000) throw Error('Metadata response too large');
      text += decoder.decode(item.value, { stream: true });
    }
    text += decoder.decode();
  } finally { try { await reader.cancel(); } catch {} reader.releaseLock(); }
  const data = JSON.parse(text);
  if (data.success !== true) throw Error('Metadata request failed');
  return data;
}
export async function discover(get) {
  const report = { schemaVersion: 1, accountId: ACCOUNT, checkedAt: new Date().toISOString(), scope: 'project-name-filtered metadata only', productionDatabaseId: PRODUCTION_DB, databases: [], workers: [], issues: [], isolationVerified: false, sqlExecuted: false, mutationsRequested: false };
  let seen = 0, finished = false;
  try {
    for (let page = 1; page <= 5; page++) {
      const data = await get(`/d1/database?page=${page}&per_page=100`);
      if (!Array.isArray(data.result)) throw Error();
      seen += data.result.length;
      for (const db of data.result.filter(db => project(db.name))) {
        if (!uuid(db.uuid)) throw Error();
        report.databases.push({ name: db.name, id: db.uuid, classification: db.uuid === PRODUCTION_DB || db.name === 'stock-watch' ? 'known-production-do-not-use-for-preview' : 'candidate-unverified' });
      }
      const total = data.result_info?.total_count;
      if (Number.isSafeInteger(total) ? seen >= total : data.result.length < 100) { finished = true; break; }
      if (!data.result.length) throw Error();
    }
    if (!finished) report.issues.push('database-pagination-limit');
  } catch { report.issues.push('database-metadata-unavailable-or-invalid'); }
  try {
    const data = await get('/workers/scripts');
    if (!Array.isArray(data.result) || data.result.length > 500 || (Number.isSafeInteger(data.result_info?.total_count) && data.result_info.total_count > data.result.length)) throw Error();
    const workers = data.result.filter(worker => project(worker.id));
    if (workers.length > 20) throw Error();
    for (const worker of workers) {
      const entry = { name: worker.id, settingsRead: false, d1Bindings: [], serviceBindings: [], classification: 'candidate-unverified' };
      try {
        const settings = (await get(`/workers/scripts/${worker.id}/settings`)).result;
        if (!Array.isArray(settings?.bindings)) throw Error();
        for (const binding of settings.bindings) {
          if (binding.type === 'd1') {
            if (typeof binding.name !== 'string' || !/^[a-zA-Z0-9_]{1,64}$/.test(binding.name) || !uuid(binding.id)) throw Error();
            entry.d1Bindings.push({ name: binding.name, databaseId: binding.id });
          }
          if (binding.type === 'service') {
            if (typeof binding.name !== 'string' || !/^[a-zA-Z0-9_]{1,64}$/.test(binding.name) || !/^[a-zA-Z0-9_-]{1,63}$/.test(binding.service || '')) throw Error();
            entry.serviceBindings.push({ name: binding.name, service: binding.service });
          }
        }
        entry.settingsRead = true;
      } catch { report.issues.push('worker-settings-unavailable-or-invalid:' + worker.id); }
      if (['stock-watch-app', 'stock-watch-prices'].includes(worker.id) || entry.d1Bindings.some(b => b.databaseId === PRODUCTION_DB)) entry.classification = 'known-production-or-production-bound-do-not-use-for-preview';
      report.workers.push(entry);
    }
  } catch { report.issues.push('worker-inventory-unavailable-invalid-or-limit'); }
  report.complete = report.issues.length === 0;
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.OUTCOME_FILE) throw Error('OUTCOME_FILE required');
  const report = process.env.CLOUDFLARE_API_TOKEN ? await discover(path => metadata(path, { token: process.env.CLOUDFLARE_API_TOKEN })) : { schemaVersion: 1, complete: false, issues: ['missing-cloudflare-token'], isolationVerified: false, sqlExecuted: false, mutationsRequested: false };
  Object.assign(report, { sourceSha: process.env.GITHUB_SHA, sourceRef: process.env.GITHUB_REF, runId: process.env.GITHUB_RUN_ID, runNumber: process.env.GITHUB_RUN_NUMBER, runAttempt: process.env.GITHUB_RUN_ATTEMPT });
  writeFileSync(process.env.OUTCOME_FILE, JSON.stringify(report, null, 2) + '\n');
  if (!report.complete) process.exitCode = 1;
}
