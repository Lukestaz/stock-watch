# Account-sync preparation: not deployed

The maintained preview entry point is `src/account-app.mjs`. `src/account-composition.mjs` now connects it to the real key loader, identity/session service, login routes and session-authenticated D1 watchlist API. Neither file is wired into deployment. Both default exports keep accounts disabled; environment flags alone cannot enable them.

## Server-side composition

`createAccountApp({enabled, allowedOrigin, db, clientId, limit, keyFetcher, clock})` requires boolean `enabled: true`, an exact HTTPS origin, a D1-shaped database, a nonempty trimmed Google client ID and a limiter function. Invalid configuration falls back to the disabled preview. Construction does not query storage or fetch keys.

The limiter must resolve to boolean true to allow a request. Login routes apply it to login/logout, and the composition applies it to watchlist requests before authentication/storage. This supplies the wiring, not a production rate-limit implementation. `keyFetcher` and `clock` are trusted server-side test dependencies, never request fields. Clock units are seconds; the key-cache adapter converts them to milliseconds.

The app strips `/api` and dispatches `/v1/auth/*` to createLoginRoutes and `/v1/watchlist` to createSessionWatchlistApi. Login and watchlist services share the database, Google client configuration and cached key loader. The existing watchlist factory constructs its own identity-service instance against that shared configuration. Account requests retain strict same-origin checks, cookie-derived identity and conditional watchlist saves. Local device data is not imported or changed, and alert enrollment remains blocked.

## Implementation and verification status

The key loader, login HTTP routes and server-side composition now exist. Older ACCOUNT_IDENTITY.md and ACCOUNT_INTEGRATION.md checklists describing those modules as unbuilt are stale on those points; their production launch warnings still apply.

Run `node --test worker/test/account-*.test.mjs`. Existing account CI matches the new source/test paths. Composition tests use locally generated RSA signatures, the real key loader/verifier/routes/session/store modules, a mocked Google key endpoint and the existing file-backed SQLite bridge with all three migrations. They simulate cookie headers, not browser cookie delivery. They are not real Google login, live D1 or a production security audit.

Before launch: review or replace the custom verifier; configure the Google client; provision and verify D1; implement production rate limits, account admission and storage quotas; build browser sign-in, account load/save and conflict handling; require explicit local import; test real browsers and two-device isolation. A separate reviewed deployment change must replace workflow-generated code with the maintained entry point. Deployment workflows, live Workers, secrets, Google configuration and infrastructure are unchanged. Do not repurpose stock-watch-prices for accounts.
