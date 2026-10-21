# Stock Watch

App: https://stock-watch-app.lukestaz.workers.dev/

A stock watchlist with delayed prices, daily-history charts, personal targets, Google sign-in and account watchlist sync. No automatic trading.

## Current architecture

- `stock-watch-app`: Cloudflare Worker serving `site/`, same-origin account/session/watchlist routes, and a price-service proxy.
- `stock-watch-prices`: separate Worker with a D1-backed price cache and provider budget controls.
- D1 database `stock-watch`: private account tables and shared price-cache tables. Private account records never belong in public assets, repository files, build artifacts or logs.
- Guest edits stay in the current browser. Signed-in account edits save to D1 with revision conflict checks. Signing in does not automatically import guest data. Logout/account changes must discard private displayed state and ignore late responses.
- Google client IDs are public configuration, not secrets. Provider credentials and deployment tokens stay server-side.

## Legacy GitHub Pages dashboard

The release patch retires the dashboard at https://lukestaz.github.io/stock-watch/ and replaces it with `legacy-pages/`: a static moved notice and explicit local snapshot downloads. This replacement takes effect only after the release is merged to main and its Pages workflow succeeds. Pages hosting remains solely for the notice; the old app, market-data assets and API calls are not published there.

The notice does not automatically redirect, upload, import, overwrite or erase watchlists. Device exports read only the existing `space-stock-watch:v1:watchlist` key after a click in the original browser/profile. Old `#watch=` share links can export their snapshot explicitly. Downloads contain readable ticker/target data; keep them private. They are backups, not automatic cloud imports. Recreate entries explicitly in the account editor if needed.

Keep `site/`: it is the Cloudflare app's source, not disposable Pages output. Update bookmarks and home-screen shortcuts to the app URL. The previous `/space-stock-watch/` project URL is not recreated by this release.

## Deployment after release merge

- `Deploy Stock Watch app`: main-only manual/source-change deployment. Requires account and legacy-export tests, checks D1 schema metadata, deploys, and verifies build, account mode, database readiness, frontend and anonymous/origin rejection. Successful trusted main-branch monitor/catalogue completions also republish their updated public snapshots/assets to the app. A deployment does not itself run the monitor.
- `Deploy D1 price cache Worker`: main-only manual/source-change deployment. Runs cache/HTTP tests, checks the existing target and schema, preserves provider secrets, deploys with a build marker, and verifies health plus two AAPL responses.
- `Publish legacy dashboard retirement notice`: main-only publication of `legacy-pages/`, never `site/`. Monitor/catalogue completions no longer republish the retired dashboard.
- `deploy-prices.yml`: deprecated no-deployment stub. Use the D1 price workflow instead.
- Existing monitor and catalogue schedules/configuration remain unchanged. The monitor can send real configured alerts; these release changes do not test delivery or enroll account watchlists.

Deployment uses pinned Wrangler 4.150.0 and the existing database. No workflow in this release applies migrations, rotates credentials or deletes private data. A failed post-deployment check does not automatically roll back uploaded code.

## Verification record - 21 October 2026

User-supplied Actions logs showed 90 account tests passing; all five required account tables/columns and six named indexes/triggers present; account-enabled deployment version `218a8bb8-d86f-4045-8487-78c7f43817ab`; and all six live post-deployment checks passing. The user also reported completing the sign-in/watchlist browser check via a private session. These are historical supplied results, not a claim that every future deployment or notification channel is verified.

The retirement export tests and release workflow checks are separate additions. The main-branch release and retirement notice still require their own successful runs after merge.

## Price and alert limitations

Prices are delayed market observations, not executable quotes. Refreshing does not guarantee a newer observation. Keep cache freshness, observation time and failed lookup states distinct. Check a current broker quote independently before trading.

Account watchlist edits do not enroll scheduled alerts. The legacy monitor uses `config/targets.json` and its configured notification destinations separately. Exactly-once delivery and actual notification receipt are not guaranteed; real channel tests require explicit approval. Share links and downloaded snapshots are not encrypted. Preserve unsaved drafts when resolving save conflicts rather than silently overwriting another device's changes.

## Remaining release checks

Review and merge the feature branch; verify the main app and price workflows; verify the old URL serves only the notice; and confirm monitor/catalogue-to-app publishing on a subsequent appropriate run. Do not trigger a real alert run solely to verify publishing without approval. Chart zoom/date-selection preservation remains a separate low-priority issue.
