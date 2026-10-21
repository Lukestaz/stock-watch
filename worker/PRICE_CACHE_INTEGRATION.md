# Price-cache endpoint integration

The price entry point now uses the D1 cache and Alpaca loader. There is no direct/unbudgeted provider fallback. Existing browser-origin and client-rate-limit checks remain; the existing upstream limiter also bounds cache-miss lookup pressure. A versioned edge key avoids old responses, and only fully fresh snapshots are edge-cached for at most 60 seconds. Stale/partial responses use no-store and retain original timestamps.

The dashboard accepts independent history/latest timestamps and displays stale/unavailable warnings through its existing warning UI. Hourly cleanup is configured at minute 17 UTC. Health checks verify both price-cache tables before reporting ready.

This commit alone does not deploy or apply migrations. Before deployment, inspect/apply the pending D1 migrations and confirm the supplied database/account and token access. Both the price Worker and frontend must be deployed for the full behaviour. The current price-deployment workflow runs manually on main; the frontend workflow currently triggers only when its own YAML changes. Neither workflow is triggered by this feature-branch commit. Do not deploy the DB-dependent endpoint before its tables exist.

Minimal local verification: six existing endpoint checks plus three focused integration checks. The HTTP tests inject the cache service; real D1/provider behaviour remains covered only by the earlier SQLite/mock core tests until live verification.
