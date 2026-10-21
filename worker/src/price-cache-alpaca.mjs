import {PriceCacheError} from './price-cache.mjs';
async function boundedJson(response) {
  const reader = response.body?.getReader(); if (!reader) throw new PriceCacheError();
  let size = 0; const chunks = [];
  try {
    for (;;) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2000000) { await reader.cancel(); throw new PriceCacheError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const value of chunks) { bytes.set(value, offset); offset += value.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
}
export function createAlpacaLoader({key, secret, fetcher = fetch,
  clock = () => Math.floor(Date.now() / 1000)} = {}) {
  if (!key || !secret || typeof fetcher !== 'function' || typeof clock !== 'function') throw Error('Alpaca configuration required');
  return async (kind, symbol, {beforeRequest} = {}) => {
    if (!['history', 'latest'].includes(kind) || !/^[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(symbol) ||
        typeof beforeRequest !== 'function') throw new PriceCacheError();
    const end = clock() - 16 * 60, history = kind === 'history';
    let pageToken; const rows = [];
    for (let page = 0; page < (history ? 3 : 1); page++) {
      const url = new URL('https://data.alpaca.markets/v2/stocks/' + encodeURIComponent(symbol) + '/bars');
      url.search = new URLSearchParams({feed: 'sip', limit: history ? '10000' : '1',
        start: new Date((end - (history ? 731 : 7) * 86400) * 1000).toISOString(),
        end: new Date(end * 1000).toISOString(), timeframe: history ? '1Day' : '1Min',
        adjustment: history ? 'split' : 'raw', sort: history ? 'asc' : 'desc',
        ...(pageToken ? {page_token: pageToken} : {})}).toString();
      await beforeRequest();
      const response = await fetcher(url.href, {redirect: 'manual', signal: AbortSignal.timeout(15000),
        headers: {'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret, Accept: 'application/json'}});
      if (!response.ok) {
        const retry = response.headers.get('Retry-After'), reset = Number(response.headers.get('X-RateLimit-Reset'));
        const seconds = retry !== null && /^\d+$/.test(retry) ? Number(retry) : NaN;
        const date = retry === null ? NaN : Date.parse(retry) / 1000;
        await response.body?.cancel();
        if (response.status === 429) throw new PriceCacheError('rate-limit',
          Math.ceil(Math.max(clock() + 60, Number.isFinite(seconds) ? clock() + seconds : 0,
            Number.isFinite(date) ? date : 0, Number.isFinite(reset) ? reset : 0)));
        throw new PriceCacheError(response.status === 404 ? 'not-found' : 'provider-unavailable');
      }
      const body = await boundedJson(response);
      if (!Array.isArray(body.bars)) throw new PriceCacheError();
      rows.push(...body.bars.filter(b => b && Number.isFinite(Date.parse(b.t)) && Date.parse(b.t) <= end * 1000 &&
        Number.isFinite(b.c) && b.c > 0 && Number.isFinite(b.l) && b.l > 0).map(b => ({t: b.t, c: b.c, l: b.l})));
      pageToken = body.next_page_token;
      if (pageToken !== null && pageToken !== undefined && (typeof pageToken !== 'string' || pageToken.length > 2000)) throw new PriceCacheError();
      if (!history || !pageToken) break;
      if (page === 2) throw new PriceCacheError('pagination-limit');
    }
    if (!rows.length) throw new PriceCacheError('not-found');
    rows.sort((a, b) => a.t.localeCompare(b.t));
    const dataCutoff = new Date(end * 1000).toISOString();
    return history ? {history: rows, dataCutoff} : {price: rows.at(-1).c, time: rows.at(-1).t, dataCutoff};
  };
}
