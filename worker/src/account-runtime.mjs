import {createAccountApp} from './account-composition.mjs';

// Configuration comes only from deployment bindings, never request input.
export function createAccountWorker({compose = createAccountApp} = {}) {
  const apps = new WeakMap();
  return {
    async fetch(request, env, ctx) {
      let app = apps.get(env);
      if (!app) {
        const enabled = env.ACCOUNTS_ENABLED === 'true' &&
          typeof env.DB?.prepare === 'function' && typeof env.DB?.batch === 'function' &&
          typeof env.GOOGLE_CLIENT_ID === 'string' && env.GOOGLE_CLIENT_ID.trim().length > 0 &&
          typeof env.ACCOUNT_LIMIT?.limit === 'function';
        app = compose({enabled, allowedOrigin: env.APP_ORIGIN, db: env.DB,
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
      return app.fetch(request, env, ctx);
    }
  };
}

export default createAccountWorker();
