# Simplicity feature handover

Updated 2026-11-08 NZDT for PR #5: https://github.com/Lukestaz/stock-watch/pull/5. Source branch: feat/simplicity-fund-monitor. Last verified application checkpoint: b80f918f2e34b8b064802654b87d0f8536d9bee5. The subsequent CI/docs follow-up is not covered by those earlier results until its own checks complete.

## Outcome and review

Read-only fund ingestion, D1 persistence, a gated API, standalone UI and agent-readable CI reporting are implemented. The page passed synthetic desktop/mobile browser tests at the checkpoint above. PR #5 is open, not merged. No remote migration, preview/production deployment, feature activation or alert delivery was performed as part of this work. Verify current remote state before rollout.

The complete original PR diff against main at 16daf175ab036ca604803dca65761a9e2924cc33 was statically reviewed: 34 files, 1,640 additions, two deletions, 16 commits. No obvious application-code blocker was found; this is not formal approval or proof that all runtime risks are excluded. Findings were branch-only Simplicity CI and outdated handovers. This follow-up extends CI to PR/main and refreshes the handovers; fresh checks are required before closing those findings.

## Implementation map

- worker/src/simplicity-catalogue.mjs: six KiwiSaver and eleven Investment identities; monitoring and alerts remain disabled.
- simplicity-history.mjs and simplicity-fetch.mjs: explicit series identity, validated CSV, bounded downloads and timeout.
- simplicity-feed-health.mjs and simplicity-snapshot.mjs: ten download-evidence mappings, explicit expected-date freshness assessment and compact snapshots. identityVerified and alertEligible remain false.
- worker/migrations/0005_simplicity.sql: public fetch-state and observation tables. No private positions or account balances. Not applied remotely by this work.
- simplicity-store.mjs: per-date observations, 90-second refresh leases, fenced atomic replacement, one-hour retrieval TTL and 60-second failure backoff. Corrections replace observations; no historical revision audit trail exists.
- simplicity-route.mjs: GET /api/v1/fund?series=..., gated by SIMPLICITY_READ_ONLY='true', origin checks and ACCOUNT_LIMIT. Requires D1; no in-memory/upstream bypass on database failure. Last-successful fallback is explicitly stale and limited to seven days since the last successful check.
- worker/src/account-runtime.mjs: intercepts the fund route; existing account composition otherwise retained.
- site/simplicity.html, simplicity.js and simplicity-view.mjs: read-only grouped fund choices, price chart and recent observations. Not linked from the stock dashboard. No personal positions or alerts.
- scripts/simplicity-diagnostics.mjs, simplicity-outcomes.mjs and the two Simplicity workflows: verification, public probes, isolated browser tests and readable results. This follow-up adds matching PR/main triggers while restricting repository-writing publishers to trusted main/feature pushes.

## Verified evidence

For b80f918, connector-retrieved results on ci-results establish:

- Verification run 42421256771, number 10, attempt 1: 65/65 Simplicity tests and 95/95 account/runtime tests passed, zero failed/skipped/cancelled; UI syntax passed; all ten feeds returned HTTP 200 and parsed. https://github.com/Lukestaz/stock-watch/actions/runs/42421256771
- Browser run 42421257083, number 2, attempt 1: 24/24 passed, 12 each in desktop Chromium and mobile WebKit, zero failed/flaky/skipped. https://github.com/Lukestaz/stock-watch/actions/runs/42421257083
- GitHub's check-runs API independently confirmed those jobs and both publishers succeeded. The new PR adapter, schema, alert-regressions and broader dashboard browser jobs also reported success for that head; the dashboard PR publisher was skipped.

Account integration fixtures apply all migrations in order, giving local SQLite coexistence coverage. Simplicity fixtures exercise real parsing/snapshot/storage/API paths against file-backed SQLite and fixture HTTP. Neither establishes live Cloudflare D1 compatibility or bindings. Earlier user-pasted logs were historical evidence; the retrieved records above supersede the old statement that no run IDs or browser results were available.

The ten downloaded feeds are KiwiSaver High Growth, Growth, Balanced, Default, Conservative and Defensive; Investment High Growth, Growth, Balanced and Conservative. At the checkpoint they reported latest observation 2026-11-04. Shared High Growth launch-price checks are sanity checks, not independent identity verification.

## Remaining limitations

- Publication freshness is unchecked unless an expected date is explicitly supplied. No provider publication schedule or holiday policy is established; cache TTL does not establish observation freshness.
- Independent feed identity verification is incomplete. Parsing success and a shared launch price cannot enable alerts.
- Seven Investment mappings remain unresolved: Homes and Income, NZ Share, NZ Bond, NZ Cash, Hedged Global Share, Unhedged Global Share and Hedged Global Bond. Catalogue presence is not endpoint verification.
- Live D1 SQL, migration application, cold/warm API reads, durable remote coordination and deployment bindings remain unverified. Do not assume a preview DB is isolated or reuse production silently.
- Personal positions, re-entry rules, persistent fund-alert delivery and scheduled fund monitoring are not implemented. Earlier illustrative thresholds were not adopted.

## Next steps and boundaries

1. Verify fresh CI on the follow-up commit, including read-only PR tests and skipped PR publishers; review mergeability and the current diff before any separate merge approval.
2. Read docs/automation-outcomes.md and docs/simplicity-browser-status.md; always match result branch/commit, rather than accepting an old latest-successful record.
3. Prepare dashboard navigation only as a separate reviewed change. Discover a genuinely non-production D1 target and deployment configuration before proposing preview work.
4. Obtain explicit approval for resolved migration/deployment targets; apply 0005 only to the approved database, deploy approved preview and verify gating, persistence and failures.
5. Resolve independent identity and publication-freshness policy before alert activation. Keep public prices separate from user-scoped financial data.

The reviewed app deployment workflow is manual and pinned to a separate release; this PR is not deployment approval. No merge, deployment, migration, provider setup or notification action is authorised by the CI/docs follow-up.
