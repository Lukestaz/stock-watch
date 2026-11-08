const names = new Set(['Error','TypeError','RangeError','SyntaxError','ReferenceError','AbortError','TimeoutError','DOMException','AggregateError']);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
function field(error, key) { try { return error?.[key]; } catch { return undefined; } }
export function redactExceptionText(value, limit = 2048) {
  let text; try { text = String(value ?? '').slice(0, 32768); } catch { return '[unavailable]'; }
  text = text.replace(/https?:\/\/[^\s"'<>]+/gi, match => { try { const url = new URL(match); return url.origin + url.pathname; } catch { return '[url redacted]'; } });
  if (text.includes('@')) text = text.replace(/[A-Z0-9._%+-]{1,128}@[A-Z0-9.-]{0,255}/gi, '[email redacted]');
  text = text.replace(/^.*\b(?:authorization|cookie|set-cookie)\s*[:=].*$/gim, '[sensitive header redacted]');
  text = text.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]');
  text = text.replace(/((?:password|secret|token|api[_-]?key)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[redacted]');
  return text.slice(0, limit);
}
export function captureRefreshException(error, { stage, seriesId, build, logger = record => console.error(JSON.stringify(record)), makeId = () => crypto.randomUUID() } = {}) {
  try {
    const errorId = makeId(); if (!uuid(errorId)) return null;
    const rawName = field(error, 'name');
    const record = {
      event: 'simplicity-refresh-error', errorId,
      stage: ['download','validate','persist'].includes(stage) ? stage : 'unknown',
      seriesId: typeof seriesId === 'string' && /^simplicity:(kiwisaver|investment):[a-z-]{1,40}$/.test(seriesId) ? seriesId : 'unknown',
      ...(typeof build === 'string' && /^[a-f0-9]{40}$/.test(build) ? { build } : {}),
      name: names.has(rawName) ? rawName : 'Error',
      message: redactExceptionText(field(error, 'message') ?? (typeof error === 'string' ? error : 'Non-standard thrown value'), 2048),
      stack: redactExceptionText(field(error, 'stack'), 8192)
    };
    logger(record);
    return errorId;
  } catch { return null; }
}
