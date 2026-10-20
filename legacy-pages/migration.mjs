export function normalizeSnapshot(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.stocks) || value.stocks.length > 100) throw Error('Invalid snapshot');
  const seen = new Set();
  return {version: 1, stocks: value.stocks.map(s => {
    if (!s || typeof s.ticker !== 'string') throw Error('Invalid ticker');
    const ticker = s.ticker.trim().toUpperCase(), target = Number(s.target);
    if (!/^[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(ticker) || !Number.isFinite(target) || target <= 0 || target > 1e9 || seen.has(ticker)) throw Error('Invalid entry');
    seen.add(ticker); return {ticker, target};
  })};
}
function mount() {
  const status = document.querySelector('#status');
  const shared = document.querySelector('#export-shared');
  shared.disabled = !location.hash.startsWith('#watch=');
  function download(source) {
    try {
      const raw = source === 'device' ? localStorage.getItem('space-stock-watch:v1:watchlist') :
        location.hash.length <= 40000 ? decodeURIComponent(location.hash.slice(7)) : null;
      if (!raw) {status.textContent = 'No saved snapshot found, or this link is too long. Nothing was changed.'; return;}
      if (raw.length > 40000) throw Error('Snapshot too large');
      const snapshot = normalizeSnapshot(JSON.parse(raw));
      const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], {type: 'application/json'}));
      const a = document.createElement('a');a.href = url;
      a.download = source === 'device' ? 'stock-watch-device-watchlist.json' : 'stock-watch-shared-watchlist.json';
      document.body.append(a);a.click();a.remove();setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = 'Backup download requested. Original data is unchanged; nothing was uploaded or imported.';
    } catch {status.textContent = 'Could not export a valid snapshot. Original data is unchanged; nothing was uploaded.';}
  }
  document.querySelector('#export-device').addEventListener('click', () => download('device'));
  shared.addEventListener('click', () => download('shared'));
}
if (typeof document !== 'undefined') mount();
