import { validateFundView, chartPoints } from './simplicity-view.mjs';
const select = document.querySelector('#fund');
const range = document.querySelector('#range');
const status = document.querySelector('#status');
const result = document.querySelector('#result');
const reload = document.querySelector('#reload');
for (const [scheme, label, funds] of [
  ['kiwisaver', 'KiwiSaver', [['high-growth','High Growth'],['growth','Growth'],['balanced','Balanced'],['default','Default'],['conservative','Conservative'],['defensive','Defensive']]],
  ['investment', 'Investment', [['high-growth','High Growth'],['growth','Growth'],['balanced','Balanced'],['conservative','Conservative']]]
]) {
  const group = document.createElement('optgroup'); group.label = label;
  for (const [slug, name] of funds) {
    const option = document.createElement('option'); option.value = `simplicity:${scheme}:${slug}`;
    option.textContent = `${label} - ${name}`; group.append(option);
  }
  select.append(group);
}
let displayed = null, controller = null, sequence = 0;
function draw() {
  if (!displayed) return;
  const all = displayed.history;
  const cutoff = Date.parse(all[all.length - 1].asOfDate + 'T00:00:00Z') - 180 * 86400000;
  const rows = range.value === 'all' ? all : all.filter(row => Date.parse(row.asOfDate + 'T00:00:00Z') >= cutoff);
  document.querySelector('#line').setAttribute('points', chartPoints(rows));
  const prices = rows.map(row => row.price);
  document.querySelector('#extent').textContent = `${rows[0].asOfDate} to ${rows[rows.length-1].asOfDate}; NZD ${Math.min(...prices).toFixed(4)} to ${Math.max(...prices).toFixed(4)}. Price-only chart, not an annualised-return calculation.`;
}
function render(data, cacheState) {
  displayed = data; result.hidden = false;
  document.querySelector('#name').textContent = select.selectedOptions[0].textContent;
  document.querySelector('#price').textContent = `NZD ${data.snapshot.price.toFixed(4)} per unit`;
  document.querySelector('#metadata').textContent = `Observation date: ${data.snapshot.asOfDate}\nRetrieved: ${new Date(data.snapshot.fetchedAt).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })} (NZ time)\nD1 cache: ${cacheState}\nPublication freshness: ${data.snapshot.freshness || 'unchecked'}\nIdentity: unverified; alerts: disabled`;
  const body = document.querySelector('#history'); body.replaceChildren();
  for (const row of data.history.slice(-30).reverse()) {
    const tr = document.createElement('tr');
    for (const text of [row.asOfDate, row.price.toFixed(4)]) { const td = document.createElement('td'); td.textContent = text; tr.append(td); }
    body.append(tr);
  }
  draw();
}
async function load() {
  const token = ++sequence;
  controller?.abort(); controller = new AbortController();
  const current = controller;
  const timer = setTimeout(() => current.abort(), 20000);
  const seriesId = select.value;
  displayed = null; result.hidden = true; reload.disabled = true; status.textContent = 'Checking fund data...';
  try {
    const response = await fetch('/api/v1/fund?series=' + encodeURIComponent(seriesId), { signal: current.signal, cache: 'no-store', credentials: 'same-origin' });
    if (token !== sequence) return;
    const body = await response.json();
    if (token !== sequence) return;
    if (response.ok) {
      render(validateFundView(body, seriesId), body.cache?.state || 'unknown');
      status.textContent = 'Published data loaded. Freshness and identity remain unverified; alerts are disabled.';
    } else if (response.status === 503 && body.cache?.state === 'stale' && body.lastSuccessful) {
      render(validateFundView(body.lastSuccessful, seriesId), 'stale');
      status.textContent = 'Refresh unavailable: showing explicitly stale last-successful data. Do not treat it as current.';
    } else {
      status.textContent = response.status === 404 ? 'Fund preview is not enabled on this deployment.' : `Fund data unavailable (HTTP ${response.status}). No current price is displayed.`;
    }
  } catch {
    if (token === sequence) status.textContent = 'Fund data could not be loaded or validated. No current price is displayed.';
  } finally {
    clearTimeout(timer);
    if (token === sequence) reload.disabled = false;
  }
}
select.addEventListener('change', load); reload.addEventListener('click', load); range.addEventListener('change', draw);
load();
