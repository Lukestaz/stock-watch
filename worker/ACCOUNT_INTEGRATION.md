# Session-authenticated watchlist composition (not deployed)

createSessionWatchlistApi composes createIdentityService.authenticate, createWatchlistApi and createD1WatchlistStore. It is disabled unless enabled is the boolean true. Invalid configuration fails closed. The production index.mjs remains unchanged; this commit adds no live routes, bindings, migrations or sign-in UI.

The composition accepts only HTTPS requests whose URL origin exactly matches allowedOrigin. That setting must be an HTTPS origin with no path or trailing slash. Any supplied Sec-Fetch-Site must be same-origin. GET without Origin is accepted only with Sec-Fetch-Site: same-origin; the wrapper supplies the checked origin to the internal handler. Other unmarked reads are denied. Writes retain the explicit Origin and JSON requirements. Fetch metadata is defense in depth, not authentication. These strict same-origin rules are not a cross-site GitHub Pages/workers.dev deployment strategy.

Identity always comes from the hashed session lookup, never client user IDs. Session expiry and logout are checked through the real service. Authentication and watchlist storage are separate database operations: a request already authenticated before a concurrent logout may finish afterward. Strict cancellation of all in-flight requests is not implemented or claimed.

Six integration test groups use seeded session records, the actual session/handler/store modules and file-backed SQLite via the existing test bridge. They cover two-user isolation, identity injection, unknown/expired/revoked sessions, racing saves, origin policy and database-authentication failure. They do not exercise Google login, real browser cookie delivery, live D1 or deployment routing. The existing account-*.test.mjs CI command picks up this suite.

Run: node --test worker/test/account-integration.test.mjs

Launch still requires a trusted Google key loader and reviewed verifier, protected login/logout HTTP routes, compatible same-origin hosting, rate limits/quotas, browser tests and actual D1 verification. Local device data must remain untouched until an explicit account import is approved. Alerts remain unavailable and the legacy monitor is unchanged.
