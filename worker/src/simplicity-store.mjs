import { DOWNLOAD_EVIDENCE } from './simplicity-feed-health.mjs';
const allowed = new Set(DOWNLOAD_EVIDENCE.map(f => f.seriesId));
const fence = 'EXISTS (SELECT 1 FROM simplicity_fetch_state WHERE series_id=? AND lease_owner=? AND lease_until>?)';

export function createSimplicityStore(db) {
  if (typeof db?.prepare !== 'function' || typeof db?.batch !== 'function') throw Error('D1 binding required');
  const stmt = (sql, args = []) => db.prepare(sql).bind(...args);
  const run = async statements => {
    const result = await db.batch(statements);
    if (result.length !== statements.length || result.some(r => r.success !== true)) throw Error('Fund store unavailable');
    return result;
  };
  function validate(seriesId, at, owner = null) {
    if (!allowed.has(seriesId) || !Number.isSafeInteger(at) || at < 0 || (owner !== null && (typeof owner !== 'string' || !owner.length || owner.length > 100))) throw Error('Invalid store arguments');
  }
  return {
    async read(seriesId) {
      if (!allowed.has(seriesId)) throw Error('Unsupported fund series');
      const result = await run([
        stmt('SELECT * FROM simplicity_fetch_state WHERE series_id=?', [seriesId]),
        stmt('SELECT as_of_date,price FROM simplicity_observations WHERE series_id=? ORDER BY as_of_date', [seriesId])
      ]);
      return { state: result[0].results[0] ?? null, history: result[1].results.map(row => ({ seriesId, asOfDate: row.as_of_date, price: row.price, currency: 'NZD' })) };
    },
    async claim(seriesId, owner, at) {
      validate(seriesId, at, owner);
      const result = await run([
        stmt('INSERT OR IGNORE INTO simplicity_fetch_state(series_id) VALUES (?)', [seriesId]),
        stmt('UPDATE simplicity_fetch_state SET lease_owner=?,lease_until=? WHERE series_id=? AND lease_until<=? AND retry_at<=? AND fresh_until<=? RETURNING series_id', [owner, at + 90, seriesId, at, at, at])
      ]);
      return result[1].results.length === 1;
    },
    async save(seriesId, owner, at, result) {
      validate(seriesId, at, owner);
      if (result?.seriesId !== seriesId || typeof result.fetchedAt !== 'string' || !Number.isFinite(Date.parse(result.fetchedAt)) || !Array.isArray(result.history) || result.history.length < 1 || result.history.length > 10000) throw Error('Invalid fund payload');
      const seen = new Set();
      const rows = result.history.map(row => {
        const date = row.asOfDate;
        const time = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(date + 'T00:00:00Z') : NaN;
        if (row.seriesId !== seriesId || row.currency !== 'NZD' || !Number.isFinite(time) || new Date(time).toISOString().slice(0,10) !== date || !Number.isFinite(row.price) || row.price <= 0 || seen.has(date)) throw Error('Invalid observation');
        seen.add(date);
        return { date, price: row.price };
      });
      const payload = JSON.stringify(rows);
      if (new TextEncoder().encode(payload).length > 1000000) throw Error('Fund payload too large');
      const resultSet = await run([
        stmt(`INSERT INTO simplicity_observations(series_id,as_of_date,price)
          SELECT ?,json_extract(value,'$.date'),json_extract(value,'$.price') FROM json_each(?) WHERE ${fence}
          ON CONFLICT(series_id,as_of_date) DO UPDATE SET price=excluded.price`, [seriesId, payload, seriesId, owner, at]),
        stmt(`DELETE FROM simplicity_observations WHERE series_id=? AND ${fence}
          AND as_of_date NOT IN (SELECT json_extract(value,'$.date') FROM json_each(?))`, [seriesId, seriesId, owner, at, payload]),
        stmt('UPDATE simplicity_fetch_state SET fetched_at=?,checked_at=?,fresh_until=?,retry_at=0,failures=0,lease_owner=NULL,lease_until=0 WHERE series_id=? AND lease_owner=? AND lease_until>? RETURNING series_id', [result.fetchedAt, at, at + 3600, seriesId, owner, at])
      ]);
      return resultSet[2].results.length === 1;
    },
    async fail(seriesId, owner, at) {
      validate(seriesId, at, owner);
      await run([stmt('UPDATE simplicity_fetch_state SET retry_at=?,failures=min(failures+1,10),lease_owner=NULL,lease_until=0 WHERE series_id=? AND lease_owner=? AND lease_until>?', [at + 60, seriesId, owner, at])]);
    }
  };
}
