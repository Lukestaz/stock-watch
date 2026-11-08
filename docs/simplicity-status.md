# Simplicity feature handover

Updated 2026-11-08 NZDT after merge and preview discovery. PR #5 is merged: https://github.com/Lukestaz/stock-watch/pull/5. Merged application checkpoint: 40986bd5e34c7e38bd349607446130699d9e8c25 on main. Preview release-preparation branch: feat/simplicity-preview-release; discovery checkpoint 532dee8113579d6036a0c7cedec8762d70403432. Read docs/simplicity-preview-release.md for the current rollout gate and exact discovery evidence.

## Outcome and review

Read-only fund ingestion, D1 persistence, gated API, standalone UI and agent-readable reporting are merged. Post-merge verification and synthetic desktop/mobile browser results passed for 40986bd. This is not a deployed or enabled feature: no remote migration, preview/production deployment, feature activation or alert delivery was performed as part of this work.

The original PR diff against main at 16daf175ab036ca604803dca65761a9e2924cc33 was statically reviewed: 34 files, 1,640 additions, two deletions, 16 commits. Findings were feature-branch-only Simplicity CI and stale handovers. Follow-up 05098bc added PR/main coverage and refreshed documentation. GitHub checks for that head completed with ten successes and three intentional PR-publisher skips, and the PR reported clean before its separately approved merge. No obvious application-code blocker was found in static review; this is not proof that every runtime risk is excluded.

Preview discovery subsequently completed and published metadata for 532dee8, but found only known production project resources. No isolated preview candidate was identified in that filtered scope. Do not reuse production as a preview or treat successful discovery as deployment approval.

## Implementation map

- worker/src/simplicity-catalogue.mjs: six KiwiSaver and eleven Investment identities; monitoring and alerts remain disabled.
- simplicity-history.mjs and simplicity-fetch.mjs: explicit series identity, validated CSV, bounded downloads and timeout.
- simplicity-feed-health.mjs and simplicity-snapshot.mjs: ten download-evidence mappings, explicit expected-date freshness assessment and compact snapshots. identityVerified and alertEligible remain false.
- worker/migrations/0005_simplicity.sql: public fetch-state and observation tables. No private positions or balances. Not applied remotely by this work.
- simplicity-store.mjs: per-date observations, 90-second refresh leases, fenced atomic replacement, one-hour retrieval TTL and 60-second failure backoff. Corrections replace observations; no historical revision audit trail exists.
- simplicity-route.mjs: GET /api/v1/fund?series=..., gated by SIMPLICITY_READ_ONLY='true', origin checks and ACCOUNT_LIMIT. Requires D1; no in-memory/upstream bypass on database failure. Last-successful fallback is explicitly stale and limited to seven days since the last successful check.
- worker/src/account-runtime.mjs: intercepts the fund route; existing account composition otherwise retained.
- site/simplicity.html, simplicity.js and simplicity-view.mjs: grouped read-only choices, chart and recent observations. Not linked from the stock dashboard. No personal positions or alerts.
- scripts/simplicity-diagnostics.mjs, simplicity-outcomes.mjs and Simplicity verification/browser workflows: matching PR/main coverage, public probes and readable results. Writers are restricted to trusted main/feature pushes, not PR events.
- scripts/simplicity-discovery.mjs and its dedicated release-branch workflow: bounded metadata-only inventory with filtered publication; no SQL or Cloudflare mutations.

## Verified evidence

For merged main checkpoint 40986bd, the connector retrieved:

- Verification run 42467661804, number 13, attempt 1: 65/65 Simplicity and 95/95 account/runtime tests passed, no failures/skips/cancellations; UI syntax and all ten public-feed checks passed. https://github.com/Lukestaz/stock-watch/actions/runs/42467661804
- Browser run 42467661837, number 5, attempt 1: 24/24 passed, 12 each in desktop Chromium and mobile WebKit, zero failures/flaky/skipped. https://github.com/Lukestaz/stock-watch/actions/runs/42467661837
- Both reports were published on ci-results with source ref main and exact merged SHA. This establishes those job results and publication, not every later workflow step or a live deployment.

For discovery checkpoint 532dee8: run 42468392125, number 1, attempt 1, checkedAt 2026-11-08T09:43:40.714Z, published complete:true with no issues and isolationVerified:false. It found production D1 stock-watch and Workers stock-watch-app and stock-watch-prices, both bound to that D1 database. SQL and Cloudflare mutations were recorded false. Full IDs, bindings, scope and limitations are in docs/simplicity-preview-release.md.

Earlier passing feature-head records remain historical: verification 42421256771 and browser 42421257083 for b80f918. The browser failure at 218b603 was fixed by explicit standalone dropdown labels, with tests unchanged. Do not substitute historical results for the expected current source commit.

Account integration fixtures apply all migrations in order, providing local SQLite coexistence coverage. Simplicity fixtures exercise parsing/snapshot/storage/API paths against file-backed SQLite and fixture HTTP. Neither establishes live D1 compatibility or bindings. The ten downloaded feeds comprise six KiwiSaver and four Investment funds; at the merged checkpoint their latest observation was 2026-11-04. Launch-price checks are sanity checks, not independent identity verification.

## Remaining limitations

- Publication freshness is unchecked without an explicit expected date. No provider publication schedule or holiday policy is established; cache TTL is not observation freshness.
- Independent feed identity verification is incomplete. Parsing success and shared launch prices cannot enable alerts.
- Seven Investment mappings remain unresolved: Homes and Income, NZ Share, NZ Bond, NZ Cash, Hedged Global Share, Unhedged Global Share and Hedged Global Bond. Catalogue presence is not endpoint verification.
- Live D1 SQL, migration application, cold/warm API reads, durable remote coordination and preview/production bindings remain unverified. No isolated preview was identified by the scoped inventory.
- Personal positions, re-entry rules, persistent fund-alert delivery and scheduled fund monitoring are not implemented. Illustrative thresholds were not adopted. Multi-user stock alerts remain a separate unmerged workstream.

## Next steps and boundaries

1. Resolve and separately approve genuinely non-production Worker/D1 targets; never silently reuse stock-watch or its production Workers.
2. Prepare pinned preview configuration and obtain separate approvals for infrastructure creation, remote migration, deployment and feature enablement. Verify live persistence, gating and failures before proposing production.
3. Add dashboard navigation only as a reviewed change; resolve identity/publication policy before alerts.
4. Keep documentation concurrent: record code/config changes in the same commit, then append verified asynchronous run outcomes without rerunning unchanged probes merely for documentation.

The reviewed app deployment workflow is manual and pinned to a separate release. This documentation update authorises no resource creation, merge, migration, deployment, provider setup, cron or notifications.
