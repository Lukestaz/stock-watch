# Simplicity feature handover

Updated: 2026-11-08 NZDT. Repository: Lukestaz/stock-watch. Branch: feat/simplicity-fund-monitor. Code checkpoint before this documentation commit: 0f5dcb82c95663f26851f85df912617b96e88e2e.

## Outcome

Read-only fund ingestion, health helpers, D1 storage, API wiring and a standalone UI are committed on this branch. No deployment, remote migration or feature activation was performed in this session. No pull request was created in this session. Verify current remote state before rollout; this document is not a live inventory.

## Implementation map

- worker/src/simplicity-catalogue.mjs: six KiwiSaver and eleven Investment identities; entries remain disabled.
- worker/src/simplicity-history.mjs and simplicity-fetch.mjs: explicit series parsing, validated CSV, bounded download and timeout.
- worker/src/simplicity-feed-health.mjs: ten download-evidence mappings, explicitly attributed to user-supplied Actions output; dated-price checks and explicit expected-date freshness assessment.
- worker/src/simplicity-snapshot.mjs: compact price snapshots; identityVerified and alertEligible remain false.
- worker/migrations/0005_simplicity.sql: public simplicity_fetch_state and simplicity_observations tables. Not applied remotely in this session. Use the existing database architecture; do not assume a preview DB is isolated.
- worker/src/simplicity-store.mjs: per-date observations, 90-second refresh leases, fenced atomic history replacement, one-hour retrieval TTL and 60-second failure backoff. Corrections replace current observations; no historical revision audit trail exists.
- worker/src/simplicity-route.mjs: GET /api/v1/fund?series=..., gated by SIMPLICITY_READ_ONLY='true', origin checks and ACCOUNT_LIMIT. Requires env.DB. No in-memory price cache or upstream bypass on D1 failure. Last-successful fallback is explicitly stale and bounded to seven days since the last successful check.
- worker/src/account-runtime.mjs: intercepts the fund route; existing account composition otherwise retained.
- site/simplicity.html, simplicity.js and simplicity-view.mjs: standalone read-only screen with grouped fund choices, price chart and recent observations. Not linked from the stock dashboard. No private positions or alerts implemented.
- scripts/simplicity-diagnostics.mjs and .github/workflows/simplicity-diagnostics.yml: branch-only public feed probes, snapshot sanity checks, Simplicity tests, account regressions and UI syntax check. No deployment or remote DB migration step.

## Evidence and provenance

The user pasted Actions output for these completed test steps after code checkpoint 0f5dcb8:

- node --test worker/test/account-*.test.mjs: 95 passed, zero failed/skipped/cancelled; approximately 4.45 seconds.
- node --test worker/test/simplicity-*.test.mjs: 60 passed, zero failed/skipped/cancelled; approximately 1.85 seconds. Includes actual fetch-adapter/parser/snapshot/store/API pipeline tests using fixture HTTP responses and file-backed SQLite. This is not live Cloudflare D1 verification.

These are user-supplied logs, not independently retrieved Actions run records. No run ID or complete workflow conclusion was available.

Earlier user-supplied live-probe output confirmed HTTP 200, CSV parsing and snapshots for ten feeds: KiwiSaver High Growth, Growth, Balanced, Default, Conservative and Defensive; Investment High Growth, Growth, Balanced and Conservative. All reported latest observation 2026-11-04 when fetched 2026-11-07. Bodies were approximately 16-46 KB. Both High Growth launch-price checks matched 1.0 on 2023-05-02. This is a sanity check, not independent identity verification. Earlier chat web-retrieval partials/failures did not reflect the successful complete runtime downloads.

## Important limitations

- Publication freshness remains unchecked unless an expected observation date is explicitly supplied. No provider publication schedule or holiday policy has been established. Cache TTL does not establish observation freshness.
- Independent feed identity verification remains incomplete. Do not enable alerts based on successful parsing or the shared launch-price check alone.
- Seven other Investment endpoint mappings remain unresolved: Homes and Income, NZ Share, NZ Bond, NZ Cash, Hedged Global Share, Unhedged Global Share and Hedged Global Bond. Catalogue presence is not endpoint verification.
- Browser rendering, keyboard/mobile interaction, stale/error UI and rapid-selection behaviour have not been browser-tested. UI helper tests and syntax checks are not browser tests.
- Live D1 SQL compatibility, migration application, cold/warm API reads, durable refresh coordination and deployment bindings remain unverified remotely. Local SQLite tests cannot establish those outcomes.
- Personal positions, re-entry rules, persistent alert delivery state and scheduled fund monitoring are not implemented. Earlier illustrative thresholds were not adopted.

## Next steps

1. Browser-test the standalone page with mocked successful, stale, unavailable, disabled and out-of-order API responses. Add a dashboard navigation link when ready.
2. Review the branch and its actual CI conclusions; do not rerun identical live downloads merely for reassurance.
3. Discover and verify deployment configuration and a genuinely non-production D1 target before preparing a preview. Do not silently reuse production bindings.
4. Obtain explicit approval for the resolved migration/deployment actions. Apply migration 0005 only to the approved target, deploy preview, and verify cold fetch, persistent subsequent reads, failures and feature gating in Cloudflare.
5. Resolve identity and publication-freshness policy before any alert activation. Keep public prices and user-scoped financial data separate.
