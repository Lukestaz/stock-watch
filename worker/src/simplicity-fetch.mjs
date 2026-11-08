import { parseSimplicityHistory } from './simplicity-history.mjs';

export async function fetchSimplicityHistory(fund, { fetchImpl = (input, init) => globalThis.fetch(input, init), now = () => new Date(), timeoutMs = 10000 } = {}) {
  if (fund?.verificationStatus !== 'verified' || !fund.feedUrl) throw new Error('Verified feed mapping required');
  const url = new URL(fund.feedUrl);
  if (url.origin !== 'https://simplicity.kiwi' || url.pathname !== '/api/download_prices' || url.username || url.password || url.hash || !url.searchParams.get('fund_name')) throw new Error('Invalid feed URL');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new Error('Invalid timeout');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let reader;
  try {
    const response = await fetchImpl(url.toString(), { signal: controller.signal, redirect: 'error', headers: { Accept: 'text/csv, text/plain;q=0.9' } });
    if (!response.ok) throw new Error(`Feed HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') ?? '';
    if (/html|json/i.test(contentType)) throw new Error('Unexpected response type');
    if (!response.body) throw new Error('Empty response body');
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0;
    let text = '';
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 2000000) throw new Error('Feed exceeds size limit');
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const history = parseSimplicityHistory(text, fund.seriesId);
    const latest = history[history.length - 1];
    return { seriesId: fund.seriesId, history, latest, fetchedAt: now().toISOString(), freshness: 'unchecked', alertEligible: false };
  } finally {
    clearTimeout(timer);
    if (reader) {
      try { await reader.cancel(); } catch {}
      reader.releaseLock();
    }
  }
}
