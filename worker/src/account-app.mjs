const json = (body, status = 200) => Response.json(body, {
  status, headers: {'Cache-Control': 'no-store'}
});
const accountPaths = new Set([
  '/api/v1/watchlist', '/api/v1/auth/start',
  '/api/v1/auth/complete', '/api/v1/auth/logout'
]);

// Preparatory entry point only; the deployment workflow still builds its own Worker.
// Account handlers must be trusted server-side composition, never request input.
export function createApp({accounts = {}} = {}) {
  const {enabled, allowedOrigin, handle} = accounts;
  let ready = false;
  try {
    const origin = new URL(allowedOrigin);
    ready = enabled === true && typeof handle === 'function' &&
      origin.protocol === 'https:' && origin.origin === allowedOrigin;
  } catch {}
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (accountPaths.has(url.pathname)) {
        if (!ready) return json({error: 'Account service unavailable'}, 503);
        const site = request.headers.get('Sec-Fetch-Site');
        const origin = request.headers.get('Origin');
        if (url.origin !== allowedOrigin || (site !== null && site !== 'same-origin') ||
            (origin !== null && origin !== allowedOrigin) ||
            (request.method !== 'GET' && origin !== allowedOrigin) ||
            (request.method === 'GET' && origin === null && site !== 'same-origin')) {
          return json({error: 'Origin not allowed'}, 403);
        }
        if (url.search) return json({error: 'Query parameters not accepted'}, 400);
        url.pathname = url.pathname.slice(4);
        try { return await handle(new Request(url, request)); }
        catch { return json({error: 'Account service unavailable'}, 503); }
      }
      if (!['GET', 'HEAD'].includes(request.method)) {
        return json({error: 'Method not allowed'}, 405);
      }
      if (url.pathname === '/api/health') {
        return json({ok: true, mode: ready ? 'account-preview' : 'local-only-preview', build: env.BUILD_SHA});
      }
      if (url.pathname === '/api/v1/stock') {
        const symbol = (url.searchParams.get('symbol') || '').trim().toUpperCase();
        if (!/^[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(symbol)) {
          return json({error: 'Invalid symbol'}, 400);
        }
        try {
          const upstream = await env.PRICES.fetch(new Request(
            'https://stock-watch-prices.lukestaz.workers.dev/v1/stock?symbol=' + encodeURIComponent(symbol),
            {headers: {Accept: 'application/json'}, signal: AbortSignal.timeout(25000)}
          ));
          const headers = new Headers({'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
          if (upstream.headers.has('Retry-After')) headers.set('Retry-After', upstream.headers.get('Retry-After'));
          return new Response(upstream.body, {status: upstream.status, headers});
        } catch { return json({error: 'Price service unavailable'}, 502); }
      }
      if (url.pathname.startsWith('/api/')) return json({error: 'Not found'}, 404);
      return env.ASSETS.fetch(request);
    }
  };
}

export default createApp();
