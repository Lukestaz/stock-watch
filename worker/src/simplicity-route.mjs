import { DOWNLOAD_EVIDENCE } from './simplicity-feed-health.mjs';
import { createSimplicityStore } from './simplicity-store.mjs';
import { captureRefreshException } from './simplicity-exception-log.mjs';

const json = (body, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});
export function classifyRefreshFailure(error, stage) {
  const phase = ['download','validate','persist'].includes(stage) ? stage : 'unknown';
  const failure = { stage: phase, category: 'unexpected-failure' };
  if (phase === 'persist') failure.category = 'storage-failure';
  else if (phase === 'validate') failure.category = error?.message === 'Future-dated feed' ? 'future-dated-feed' : 'snapshot-invalid';
  else if (phase === 'download') {
    const http = /^Feed HTTP ([1-5][0-9]{2})$/.exec(error?.message || '');
    if (http) return { stage: phase, category: 'upstream-http', httpStatus: Number(http[1]) };
    if (['AbortError','TimeoutError'].includes(error?.name)) failure.category = 'upstream-timeout';
    else if (error?.message === 'Unexpected response type') failure.category = 'upstream-content-type';
    else if (error?.message === 'Empty response body') failure.category = 'upstream-empty';
    else if (error?.message === 'Feed exceeds size limit') failure.category = 'upstream-size-limit';
    else if (['Verified feed mapping required','Invalid feed URL','Invalid timeout'].includes(error?.message)) failure.category = 'fetch-configuration';
    else if (['Explicit supported series identity required','CSV text required','Unexpected CSV header','Invalid CSV row','Expected DD-MM-YYYY date','Invalid calendar date','Invalid price','Price must be positive and finite','Conflicting duplicate date','No price observations'].includes(error?.message)) failure.category = 'csv-invalid';
    else failure.category = 'download-or-runtime-failure';
  }
  return failure;
}
const loadDefault = async fund => {
  const { fetchSimplicityHistory } = await import('./simplicity-fetch.mjs');
  return fetchSimplicityHistory({ ...fund, verificationStatus: 'verified' });
};
const snapshotDefault = async (result, options) => {
  const { buildFundSnapshot } = await import('./simplicity-snapshot.mjs');
  return buildFundSnapshot(result, options);
};

export function createSimplicityRoute({ load = loadDefault, snapshot = snapshotDefault, now = () => Date.now(), ownerId = () => crypto.randomUUID() } = {}) {
  const seconds = () => Math.floor(now() / 1000);
  const todayNZ = () => {
    const parts = new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(now()));
    const part = type => parts.find(value => value.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
  async function value(row, seriesId) {
    if (!row.state?.fetched_at || !row.history.length || seconds() - row.state.checked_at > 604800) return null;
    return {
      snapshot: await snapshot({ seriesId, history: row.history, fetchedAt: row.state.fetched_at }, { todayNZ: todayNZ() }),
      history: row.history.map(item => ({ asOfDate: item.asOfDate, price: item.price }))
    };
  }
  async function unavailable(row, seriesId, reason, failure = null) {
    const previous = await value(row, seriesId);
    return json({ error: 'Fund data temporarily unavailable', cache: { storage: 'd1', state: previous ? 'stale' : 'unavailable', reason, retryAt: row.state?.retry_at || null, ...(failure ? { failure } : {}) }, lastSuccessful: previous }, 503);
  }
  return async function handle(request, env) {
    if (env.SIMPLICITY_READ_ONLY !== 'true') return json({ error: 'Not found' }, 404);
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const site = request.headers.get('Sec-Fetch-Site');
    if (!env.APP_ORIGIN || url.origin !== env.APP_ORIGIN || (origin && origin !== env.APP_ORIGIN) || (site && site !== 'same-origin' && site !== 'none')) return json({ error: 'Origin not allowed' }, 403);
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    const keys = [...url.searchParams.keys()];
    if (keys.length !== 1 || keys[0] !== 'series') return json({ error: 'One series parameter required' }, 400);
    const fund = DOWNLOAD_EVIDENCE.find(item => item.seriesId === url.searchParams.get('series'));
    if (!fund) return json({ error: 'Unsupported fund series' }, 400);
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip || typeof env.ACCOUNT_LIMIT?.limit !== 'function') return json({ error: 'Fund rate limiter unavailable' }, 503);
    try {
      if (!(await env.ACCOUNT_LIMIT.limit({ key: 'funds:' + ip }))?.success) return json({ error: 'Too many requests' }, 429);
    } catch { return json({ error: 'Fund rate limiter unavailable' }, 503); }
    try {
      const store = createSimplicityStore(env.DB);
      let row = await store.read(fund.seriesId);
      if (row.state?.fresh_until > seconds()) {
        const existing = await value(row, fund.seriesId);
        if (existing) return json({ ...existing, cache: { storage: 'd1', state: 'cached' } });
      }
      if (row.state?.retry_at > seconds()) return await unavailable(row, fund.seriesId, 'backoff');
      const owner = ownerId();
      if (!await store.claim(fund.seriesId, owner, seconds())) {
        row = await store.read(fund.seriesId);
        const existing = row.state?.fresh_until > seconds() ? await value(row, fund.seriesId) : null;
        return existing ? json({ ...existing, cache: { storage: 'd1', state: 'cached' } }) : await unavailable(row, fund.seriesId, 'refresh-in-progress');
      }
      let saved, phase = 'download';
      try {
        const result = await load(fund);
        phase = 'validate';
        const checked = await snapshot(result, { todayNZ: todayNZ() });
        if (checked.freshness === 'future-dated') throw Error('Future-dated feed');
        phase = 'persist';
        saved = await store.save(fund.seriesId, owner, seconds(), result);
      } catch (error) {
        const errorId = captureRefreshException(error, { stage: phase, seriesId: fund.seriesId, build: env.BUILD_SHA });
        const failure = { ...classifyRefreshFailure(error, phase), ...(errorId ? { errorId } : {}) };
        await store.fail(fund.seriesId, owner, seconds());
        return await unavailable(await store.read(fund.seriesId), fund.seriesId, 'refresh-failed', failure);
      }
      row = await store.read(fund.seriesId);
      const stored = row.state?.fresh_until > seconds() ? await value(row, fund.seriesId) : null;
      return stored ? json({ ...stored, cache: { storage: 'd1', state: saved ? 'refreshed' : 'cached' } }) : await unavailable(row, fund.seriesId, 'lease-lost');
    } catch {
      return json({ error: 'Fund database unavailable', cache: { storage: 'd1', state: 'unavailable' } }, 503);
    }
  };
}
