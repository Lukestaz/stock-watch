# Prepared Simplicity UI production release - 2026-11-14

Preparation only: adding this workflow, runner, guard tests and document does not deploy. The trigger watches only config/simplicity-ui-release.json, which is deliberately not created by preparation. No workflow dispatch or automatic deployment on app-source edits is enabled.

Resolved target: existing stock-watch-app at https://stock-watch-app.lukestaz.workers.dev, Cloudflare account c4814713eafd41ae857b9a8097610df6, existing D1 4cb54afc-8f2d-4f62-8b6b-7d59f343b938.

Runtime pin: 51f4f4400f008a0aa2d913febbfe0ae1a067b654, the last recorded verified production release. Frontend pin: 9bcea9ce1008847dca71069d48d1b0957c5193e0. Its code assets match browser-tested cbb993f; only data.json and catalog.json differ, preserving newer public stock snapshots. Keep the production-only exception diagnostics instead of replacing the runtime from main.

The future activation requires separate exact approval to create the request manifest. The runner requires the live build to remain 51f4f44; the historical release report is not assumed to be a current health check. A changed live build, enabled/unknown alert state, unexpected bindings/schema/schedules or failed tests stops deployment. Combined runtime/frontend unit, account, legacy and isolated desktop/mobile browser suites run before provider access. Production deployment uses a fresh job and pinned Wrangler.

No migrations, secrets rotation, notifications, private-row queries or alert activation. Read-only schema metadata and normal fund GETs are used; the latter may refresh the existing public-price cache. Sign-in, D1, price-service and rate-limit bindings are preserved. Postchecks cover build markers, asset hashes, two fund series/cache reuse, origin protection, anonymous watchlist rejection and disabled alert routes. Rollback metadata is captured; no automatic rollback is performed.

Outcomes publish to ci-results:simplicity-release/ui/latest.json and per-run records, including failed preflight or skipped deployment. Before activating, inspect preparation CI and match all results to the actual preparation commit. After activation, require the release record to show deploymentVerified=true and checks/deploy success; distinguish this from merely committing the UI. Local syntax/guard checks are preparation evidence only, not a deployment or browser pass.
