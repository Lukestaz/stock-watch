import {createAccountApp} from './account-composition.mjs';

// Configuration comes only from deployment bindings, never request input.
export function createAccountWorker({compose = createAccountApp,
  friendsLoader = () => import('./account-friends-runtime.mjs'),
  fetcher = (input, init) => globalThis.fetch(input, init), clock} = {}) {
  const apps = new WeakMap(), friends = new WeakMap();
  const getFriends = async env => {
    if (env.ACCOUNTS_ENABLED !== 'true' || env.FRIENDS_ALERTS_ENABLED !== 'true') return null;
    if (!friends.has(env)) friends.set(env, Promise.resolve().then(async () => {
      const module = await friendsLoader();
      return module.createFriendsRuntime({env, fetcher, ...(clock ? {clock} : {})});
    }).catch(() => null));
    return friends.get(env);
  };
  return {
    async fetch(request, env, ctx) {
      const path = new URL(request.url).pathname;
      if (['/api/v1/alert-destination/email','/api/v1/alert-destination/email/verify','/api/v1/alert-consent/email'].includes(path)) {
        const service = await getFriends(env);
        return service?.ready ? service.fetch(request) : Response.json({error:'Friends alerts unavailable'}, {status:503, headers:{'Cache-Control':'no-store'}});
      }
      let app = apps.get(env);
      if (!app) {
        const enabled = env.ACCOUNTS_ENABLED === 'true' &&
          typeof env.DB?.prepare === 'function' && typeof env.DB?.batch === 'function' &&
          typeof env.GOOGLE_CLIENT_ID === 'string' && env.GOOGLE_CLIENT_ID.trim().length > 0 &&
          typeof env.ACCOUNT_LIMIT?.limit === 'function';
        app = compose({enabled, ...(clock ? {clock} : {}), allowedOrigin: env.APP_ORIGIN, db: env.DB,
          clientId: env.GOOGLE_CLIENT_ID,
          keyFetcher: (input, init) => globalThis.fetch(input, init),
          limit: async (r, path) => {
            const ip = r.headers.get('CF-Connecting-IP');
            if (!ip || typeof env.ACCOUNT_LIMIT?.limit !== 'function') return false;
            const result = await env.ACCOUNT_LIMIT.limit({key: 'accounts:' + path + ':' + ip});
            return result?.success === true;
          }
        });
        apps.set(env, app);
      }
      const response = await app.fetch(request, env, ctx);
      if (path !== '/api/health' || env.FRIENDS_ALERTS_ENABLED !== 'true' || !response.ok) return response;
      try {
        const service = await getFriends(env), data = await response.clone().json();
        const headers = new Headers(response.headers); headers.delete('Content-Length'); headers.set('Cache-Control','no-store');
        return new Response(JSON.stringify({...data, friendsAlerts:{verificationReady:service?.ready===true,enrollmentAvailable:service?.enrollmentEnabled===true,scheduledConfigured:service?.scheduledConfigured===true}}), {status:response.status,headers});
      } catch { return response; }
    },
    async scheduled(event, env, ctx) {
      if (env.FRIENDS_SCHEDULE_ENABLED !== 'true') return {status:'disabled'};
      const service = await getFriends(env);
      if (!service?.ready) return {status:'disabled'};
      const work = service.scheduled(); if (typeof ctx?.waitUntil === 'function') ctx.waitUntil(work);
      const result = await work;
      const summary = {event:'friends-schedule',status:result?.status};
      for (const key of ['symbols','observations','eventsCreated','accepted','deferred','failed','uncertain','errors']) if (Number.isFinite(result?.[key])) summary[key] = result[key];
      console.log(JSON.stringify(summary));
      return result;
    }
  };
}

export default createAccountWorker();
