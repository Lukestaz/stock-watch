import { getSimplicityFund } from './simplicity-catalogue.mjs';

export function parseSimplicityHistory(text, seriesId) {
  if (!getSimplicityFund(seriesId)) throw new Error('Explicit supported series identity required');
  if (typeof text !== 'string') throw new Error('CSV text required');
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.shift()?.trim() !== 'Date,Price') throw new Error('Unexpected CSV header');
  const rows = new Map();
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = line.split(',').map(cell => cell.trim());
    if (cells.length !== 2) throw new Error('Invalid CSV row');
    const [date, rawPrice] = cells;
    const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(date);
    if (!match) throw new Error('Expected DD-MM-YYYY date');
    const [, day, month, year] = match;
    const asOfDate = `${year}-${month}-${day}`;
    const time = Date.parse(`${asOfDate}T00:00:00Z`);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== asOfDate) throw new Error('Invalid calendar date');
    if (!/^\d+(?:\.\d+)?$/.test(rawPrice)) throw new Error('Invalid price');
    const price = Number(rawPrice);
    if (!Number.isFinite(price) || price <= 0) throw new Error('Price must be positive and finite');
    if (rows.has(asOfDate) && rows.get(asOfDate).price !== price) throw new Error('Conflicting duplicate date');
    rows.set(asOfDate, { seriesId, asOfDate, price, currency: 'NZD' });
  }
  if (!rows.size) throw new Error('No price observations');
  return [...rows.values()].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
}
