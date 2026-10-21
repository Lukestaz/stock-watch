const DATASET = 'alpaca-sip-v1';
const PROVIDER = 'alpaca';
const DAY = 86400;
const maxAge = kind => kind === 'history' ? 35 * DAY : 7 * DAY;
export class PriceCacheError extends Error {
  constructor(code = 'unavailable', retryAt = 0) {
    super('Price data temporarily unavailable');
    this.code = code; this.retryAt = retryAt;
  }
}
export function quoteTtl(now) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(now * 1000));
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  const minute = Number(p.hour) * 60 + Number(p.minute);
  return !['Sat', 'Sun'].includes(p.weekday) && minute >= 570 && minute < 990 ? 300 : 3600;
}
function validate(kind, value) {
  if (!value || !Number.isFinite(Date.parse(value.dataCutoff))) throw new PriceCacheError();
  const cutoff = Date.parse(value.dataCutoff);
  if (kind === 'history') {
    if (!Array.isArray(value.history) || value.history.length > 10000 || value.history.some(b =>
      !b || !Number.isFinite(Date.parse(b.t)) || Date.parse(b.t) > cutoff ||
      !Number.isFinite(b.c) || b.c <= 0 || !Number.isFinite(b.l) || b.l <= 0)) throw new PriceCacheError();
  } else if (!Number.isFinite(value.price) || value.price <= 0 ||
    !Number.isFinite(Date.parse(value.time)) || Date.parse(value.time) > cutoff) throw new PriceCacheError();
  const text = JSON.stringify(value);
  if (new TextEncoder().encode(text).length > 131072) throw new PriceCacheError();
  return text;
}
export function createPriceCache({db, load, clock = () => Math.floor(Date.now() / 1000),
  latestTtl = quoteTtl, dailyLimit = 5000, minuteLimit = 100, maxEntries = 1000} = {}) {
  if (typeof db?.prepare !== 'function' || typeof db?.batch !== 'function' ||
      typeof load !== 'function' || typeof clock !== 'function' || typeof latestTtl !== 'function' ||
      !Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 1000000 ||
      !Number.isInteger(minuteLimit) || minuteLimit < 1 || minuteLimit > 10000 ||
      !Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 1000) throw Error('Invalid price cache configuration');
  const now = () => {
    const value = clock();
    if (!Number.isSafeInteger(value) || value < 0) throw new PriceCacheError();
    return value;
  };
  const stmt = (sql, args = []) => db.prepare(sql).bind(...args);
  const batch = async statements => {
    const r = await db.batch(statements);
    if (r.length !== statements.length || r.some(x => x.success !== true)) throw new PriceCacheError();
    return r;
  };
  const readRow = async (symbol, kind) => (await batch([stmt(
    'SELECT * FROM price_cache_entries WHERE dataset=? AND symbol=? AND kind=?', [DATASET, symbol, kind]
  )]))[0].results[0];
  const view = (row, kind, at, reason = null) => {
    if (!row?.payload || at - row.checked_at > maxAge(kind)) return null;
    try {
      const data = JSON.parse(row.payload); validate(kind, data);
      return {data, checkedAt: row.checked_at, freshUntil: row.fresh_until,
        retryAt: row.retry_at, state: row.fresh_until > at ? 'fresh' : 'stale', reason};
    } catch { return null; }
  };
  async function beforeRequest() {
    const at = now(), day = Math.floor(at / DAY) * DAY, minute = Math.floor(at / 60) * 60;
    const r = await batch([
      stmt('INSERT OR IGNORE INTO price_cache_budget(provider) VALUES (?)', [PROVIDER]),
      stmt(`UPDATE price_cache_budget SET
        day_calls=CASE WHEN day_start=? THEN day_calls+1 ELSE 1 END,day_start=?,
        minute_calls=CASE WHEN minute_start=? THEN minute_calls+1 ELSE 1 END,minute_start=?
        WHERE provider=? AND cooldown_until<=?
        AND (day_start<>? OR day_calls<?) AND (minute_start<>? OR minute_calls<?)
        RETURNING provider`, [day, day, minute, minute, PROVIDER, at, day, dailyLimit, minute, minuteLimit]),
      stmt('SELECT * FROM price_cache_budget WHERE provider=?', [PROVIDER])
    ]);
    if (!r[1].results.length) {
      const row = r[2].results[0];
      throw new PriceCacheError('budget', Math.max(at + 1, row.cooldown_until,
        row.day_start === day && row.day_calls >= dailyLimit ? day + DAY : 0,
        row.minute_start === minute && row.minute_calls >= minuteLimit ? minute + 60 : 0));
    }
  }
  async function read(symbol, kind) {
    symbol = String(symbol || '').trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(symbol) || !['history', 'latest'].includes(kind)) throw new PriceCacheError('invalid-symbol');
    const at = now(); let row = await readRow(symbol, kind);
    let existing = view(row, kind, at);
    if (existing?.state === 'fresh') return existing;
    if (row?.retry_at > at) {
      if (existing) return {...existing, reason: 'backoff'};
      throw new PriceCacheError('backoff', row.retry_at);
    }
    const owner = crypto.randomUUID();
    const claim = await batch([
      stmt(`INSERT OR IGNORE INTO price_cache_entries(dataset,symbol,kind)
        SELECT ?,?,? WHERE (SELECT count(*) FROM price_cache_entries)<?`, [DATASET, symbol, kind, maxEntries]),
      stmt(`UPDATE price_cache_entries SET lease_owner=?,lease_until=?
        WHERE dataset=? AND symbol=? AND kind=? AND lease_until<=? AND retry_at<=? AND fresh_until<=?
        RETURNING *`, [owner, at + 90, DATASET, symbol, kind, at, at, at])
    ]);
    if (!claim[1].results.length) {
      row = await readRow(symbol, kind); existing = view(row, kind, now(), 'refresh-in-progress');
      if (existing) return existing;
      throw new PriceCacheError('busy-or-capacity', at + 1);
    }
    row = claim[1].results[0];
    try {
      const data = await load(kind, symbol, {beforeRequest});
      const payload = validate(kind, data), completed = now();
      const ttl = kind === 'history' ? DAY : latestTtl(completed);
      if (!Number.isInteger(ttl) || ttl < 1 || ttl > DAY) throw new PriceCacheError();
      const saved = await batch([stmt(`UPDATE price_cache_entries SET payload=?,checked_at=?,fresh_until=?,
        retry_at=0,failures=0,lease_owner=NULL,lease_until=0
        WHERE dataset=? AND symbol=? AND kind=? AND lease_owner=? AND lease_until>?
        RETURNING *`, [payload, completed, completed + ttl, DATASET, symbol, kind, owner, completed])]);
      const result = view(saved[0].results[0] || await readRow(symbol, kind), kind, now());
      if (!result) throw new PriceCacheError();
      return result;
    } catch (e) {
      const failed = now();
      const code = ['budget', 'rate-limit', 'not-found'].includes(e?.code) ? e.code : 'provider-unavailable';
      const requested = Number.isSafeInteger(e?.retryAt) ? e.retryAt : 0;
      const retryAt = Math.max(failed + Math.min(3600, 30 * 2 ** Math.min(row.failures, 7)), requested);
      const statements = [];
      if (code === 'rate-limit') {
        statements.push(stmt('UPDATE price_cache_budget SET cooldown_until=max(cooldown_until,?) WHERE provider=?', [retryAt, PROVIDER]));
      }
      statements.push(stmt(`UPDATE price_cache_entries SET retry_at=?,failures=min(failures+1,10),lease_owner=NULL,lease_until=0
        WHERE dataset=? AND symbol=? AND kind=? AND lease_owner=? AND lease_until>?`,
        [retryAt, DATASET, symbol, kind, owner, failed]));
      await batch(statements);
      existing = view(await readRow(symbol, kind), kind, now(), code);
      if (existing) return existing;
      throw new PriceCacheError(code, retryAt);
    }
  }
  return {read, async get(symbol) {
    const results = await Promise.allSettled([read(symbol, 'history'), read(symbol, 'latest')]);
    const history = results[0].status === 'fulfilled' ? results[0].value : null;
    const latest = results[1].status === 'fulfilled' ? results[1].value : null;
    if (!history?.data.history.length && !latest) throw new PriceCacheError('unavailable',
      Math.max(...results.map(r => r.status === 'rejected' ? r.reason?.retryAt || 0 : 0)));
    const metadata = part => part ? {state: part.state, checkedAt: new Date(part.checkedAt * 1000).toISOString(),
      freshUntil: new Date(part.freshUntil * 1000).toISOString(), reason: part.reason} : {state: 'unavailable'};
    return {symbol: String(symbol).trim().toUpperCase(), source: 'Alpaca SIP',
      fetchedAt: new Date((latest || history).checkedAt * 1000).toISOString(),
      dataCutoff: (latest || history).data.dataCutoff, historyDataCutoff: history?.data.dataCutoff || null,
      history: history?.data.history || [], ...(latest ? {price: latest.data.price, time: latest.data.time} : {}),
      delayMinutesMinimum: 16, historyAdjustment: 'split', priceAdjustment: 'raw',
      historyMayIncludeInProgressDay: true, alertsActive: false,
      cache: {history: metadata(history), latest: metadata(latest)}};
  }, async cleanup() {
    const at = now();
    return batch([stmt(`DELETE FROM price_cache_entries WHERE lease_until<=? AND
      ((payload IS NULL AND retry_at<=?) OR (payload IS NOT NULL AND checked_at<?-
      CASE WHEN kind='history' THEN ? ELSE ? END))`, [at, at, at, 35 * DAY, 7 * DAY])]);
  }};
}
