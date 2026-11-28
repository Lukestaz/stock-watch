function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function validateFundView(value, seriesId) {
  const s = value?.snapshot;
  if (s?.seriesId !== seriesId || s.currency !== 'NZD' || !validDate(s.asOfDate) || !Number.isFinite(s.price) || s.price <= 0 || typeof s.fetchedAt !== 'string' || !Number.isFinite(Date.parse(s.fetchedAt)) || !Array.isArray(value.history) || !value.history.length) throw Error('Invalid fund response');
  const dates = new Set();
  const history = value.history.map(row => {
    if (!validDate(row.asOfDate) || !Number.isFinite(row.price) || row.price <= 0 || dates.has(row.asOfDate)) throw Error('Invalid price history');
    dates.add(row.asOfDate);
    return { asOfDate: row.asOfDate, price: row.price };
  }).sort((a,b) => a.asOfDate.localeCompare(b.asOfDate));
  const latest = history[history.length - 1];
  if (latest.asOfDate !== s.asOfDate || latest.price !== s.price) throw Error('Snapshot/history mismatch');
  return { snapshot: s, history };
}
export function chartPoints(rows) {
  if (!rows.length) return '';
  const times = rows.map(r => Date.parse(r.asOfDate + 'T00:00:00Z'));
  const prices = rows.map(r => r.price);
  const first = Math.min(...times), span = Math.max(...times) - first || 1;
  const low = Math.min(...prices), height = Math.max(...prices) - low || 1;
  return rows.map((row, i) => `${(20 + 760 * (times[i] - first) / span).toFixed(2)},${(220 - 200 * (row.price - low) / height).toFixed(2)}`).join(' ');
}

export function publicationLabel(freshness) {
  switch (freshness) {
    case 'current':
    case 'fresh': return 'Meets the configured expected date; latest publication not independently verified';
    case 'stale': return 'Behind the configured expected date';
    case 'future-dated': return 'Future-dated observation; source needs review';
    default: return 'Not independently verified';
  }
}

export function publicationContext(snapshot, cache) {
  const retrieved = Date.parse(snapshot?.fetchedAt);
  const source = cache === 'stale'
    ? 'Source refresh unavailable. Showing the last successful retrieval, not a newly downloaded valuation.'
    : cache === 'cached'
      ? 'Showing D1-cached data. Refreshing the page does not necessarily download the CSV again.'
      : 'A successful retrieval does not prove that a newer valuation has been published.';
  return {
    publication: publicationLabel(snapshot?.freshness),
    source,
    retrieved: Number.isFinite(retrieved)
      ? new Date(retrieved).toLocaleString('en-NZ', {timeZone: 'Pacific/Auckland'}) + ' (NZ time)'
      : 'Unavailable',
    warning: cache === 'stale' || ['stale', 'future-dated'].includes(snapshot?.freshness),
    estimateAvailable: false
  };
}

export function renderFundContext(result, snapshot, cache) {
  const doc = result.ownerDocument, model = publicationContext(snapshot, cache);
  let panel = result.querySelector('#publication-context');
  if (!panel) {
    panel = doc.createElement('section');
    panel.id = 'publication-context';
    panel.className = 'panel';
    panel.setAttribute('aria-labelledby', 'publication-heading');
    result.insertBefore(panel, result.children[1] || null);
  }
  panel.replaceChildren();
  const add = (parent, tag, text, className) => {
    const element = doc.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    parent.append(element);
    return element;
  };
  add(panel, 'h2', 'Published price timing').id = 'publication-heading';
  add(panel, 'p', 'Publication status: ' + model.publication + '.', model.warning ? 'warning' : 'muted');
  add(panel, 'p', 'Unit prices normally have a two-working-day publication delay. Weekends and holidays can affect the calendar gap. The exact CSV update time and holiday policy have not been verified.');
  add(panel, 'p', model.source, cache === 'stale' ? 'warning' : 'muted');
  add(panel, 'p', 'Source retrieved: ' + model.retrieved, 'muted');
  add(panel, 'h3', 'Estimated unpublished price');
  add(panel, 'p', 'Unavailable — no estimated price is currently calculated or plotted.', 'muted');
  add(panel, 'p', 'Numerical estimates are withheld until fund-specific allocations, currency hedging, market-data proxies and valuation cutoffs have been validated.', 'muted');
  add(panel, 'p', 'Any future estimate will be labelled separately from published prices and will not be an executable switch price. Official history remains unchanged.', 'muted');
}
