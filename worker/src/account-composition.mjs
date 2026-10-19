import {createApp} from './account-app.mjs';
import {createGoogleKeyLoader} from './account-google-keys.mjs';
import {createIdentityService} from './account-identity.mjs';
import {createLoginRoutes} from './account-login-routes.mjs';
import {createSessionWatchlistApi} from './account-integration.mjs';

const unavailable = () => Response.json({error: 'Account service unavailable'}, {
  status: 503, headers: {'Cache-Control': 'no-store'}
});

// Server-side configuration only. This factory is not a deployed entry point.
export function createAccountApp({enabled = false, allowedOrigin, db, clientId,
  limit, keyFetcher, clock} = {}) {
  if (enabled !== true) return createApp();
  try {
    const origin = new URL(allowedOrigin);
    if (origin.protocol !== 'https:' || origin.origin !== allowedOrigin ||
        typeof clientId !== 'string' || !clientId || clientId.trim() !== clientId ||
        typeof limit !== 'function' || (clock !== undefined && typeof clock !== 'function')) {
      throw Error('Invalid account configuration');
    }
    const loadGoogleKeys = createGoogleKeyLoader({fetcher: keyFetcher,
      ...(clock ? {clock: () => clock() * 1000} : {})});
    const config = {db, clientId, loadGoogleKeys, clock};
    const identity = createIdentityService(config);
    const login = createLoginRoutes({enabled: true, allowedOrigin, identity, limit});
    const watchlist = createSessionWatchlistApi({enabled: true, allowedOrigin, ...config});
    const handle = async request => {
      if (new URL(request.url).pathname !== '/v1/watchlist') return login(request);
      try {
        if (await limit(request, '/v1/watchlist') !== true) {
          return Response.json({error: 'Too many requests'}, {
            status: 429, headers: {'Cache-Control': 'no-store'}
          });
        }
        return await watchlist(request);
      } catch { return unavailable(); }
    };
    return createApp({accounts: {enabled: true, allowedOrigin, handle}});
  } catch { return createApp(); }
}

export default createAccountApp();
