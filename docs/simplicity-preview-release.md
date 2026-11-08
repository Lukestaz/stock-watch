# Simplicity release preparation: production selected

Updated 2026-11-08 NZDT. The owner explicitly chose direct production for this play app instead of creating an isolated preview. Read docs/simplicity-production-release.md for the exact target, migration/deployment plan, pending execution status, verification and recovery boundaries. This is a release-plan change, not evidence that a deployment succeeded.

## Historical discovery

Branch feat/simplicity-preview-release was created from main 40986bd5e34c7e38bd349607446130699d9e8c25. Discovery implementation 532dee8113579d6036a0c7cedec8762d70403432 produced run 42468392125, number 1, attempt 1, checked 2026-11-08T09:43:40.714Z. Its published report is ci-results:simplicity-release/discovery/latest.json (and the corresponding per-run record). Metadata reading completed with no issues, no SQL and no Cloudflare mutations; isolationVerified remained false.

The scoped inventory found only D1 stock-watch (4cb54afc-8f2d-4f62-8b6b-7d59f343b938), Worker stock-watch-app bound to that DB and service stock-watch-prices, and Worker stock-watch-prices bound to the same DB. No isolated project-named preview candidate was found. This was not an exhaustive audit of differently named resources.

Do not relabel those production resources as isolated previews. The direct-production release uses them explicitly as production, with a separately confirmed migration/deployment workflow. No preview resource creation is planned. Multi-user alerts remain separate and off.
