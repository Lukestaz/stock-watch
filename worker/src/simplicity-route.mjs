import { DOWNLOAD_EVIDENCE } from './simplicity-feed-health.mjs';

const json = (body, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});
const loadDefault = async fund => {
  const { fetchSimplicityHistory } = await import('./simplicity-fetch.mjs');
  return fetchSimplicityHistory({ ...fund, verificationStatus: 'verified' });
};
const snapshotDefault = async (result, options) => {
  const { buildFundSnapshot } = await import('./simplicity-snapshot.mjs');
  return buildFundSnapshot(result, options);
};

export function createSimplicityRoute({ load = loadDefault, snapshot = snapshotDefault, now = () => Date.now() } = {}) {
  const cache = new Map();
  const pending = new Map();
  const retryAfter = new Map();
  const ttl = 3600000;
  async function refresh(fund) {
    const result = await load(fund);
    const parts = new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(now()));
    const part = type => parts.find(value => value.type === type).value;
    const todayNZ = `${part('year')}-${part('month')}-${part('day')}`;
    const value = {
      snapshot: await snapshot(result, { todayNZ }),
      history: result.history.map(row => ({ asOfDate: row.asOfDate, price: row.price }))
    };
    cache.set(fund.seriesId, { value, expiresAt: now() + ttl });
    retryAfter.delete(fund.seriesId);
    return value;
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
    const fund = DOWNLOAD_EVIDENCE.find(value => value.seriesId === url.searchParams.get('series'));
    if (!fund) return json({ error: 'Unsupported fund series' }, 400);
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip || typeof env.ACCOUNT_LIMIT?.limit !== 'function') return json({ error: 'Fund rate limiter unavailable' }, 503);
    try {
      if (!(await env.ACCOUNT_LIMIT.limit({ key: 'funds:' + ip }))?.success) return json({ error: 'Too many requests' }, 429);
    } catch { return json({ error: 'Fund rate limiter unavailable' }, 503); }
    const cached = cache.get(fund.seriesId);
    if (cached && cached.expiresAt > now()) return json({ ...cached.value, cache: { state: 'cached' } });
    if ((retryAfter.get(fund.seriesId) || 0) > now()) return json({ error: 'Fund feed temporarily unavailable', cache: { state: cached ? 'stale' : 'unavailable' }, lastSuccessful: cached?.value ?? null }, 503);
    try {
      if (!pending.has(fund.seriesId)) {
        pending.set(fund.seriesId, refresh(fund).catch(error => {
          retryAfter.set(fund.seriesId, now() + 60000);
          throw error;
        }).finally(() => pending.delete(fund.seriesId)));
      }
      const value = await pending.get(fund.seriesId);
      return json({ ...value, cache: { state: 'refreshed' } });
    } catch {
      return json({ error: 'Fund feed temporarily unavailable', cache: { state: cached ? 'stale' : 'unavailable' }, lastSuccessful: cached?.value ?? null }, 503);
    }
  };
}
