# Simplicity feature handover

## Current checkpoint - 2026-11-25 NZDT

Authoritative consolidated documentation checkpoint, not a live-health feed. Documentation branch: `docs/simplicity-all-funds`; remotely inspected head before this integration: `68ecf4193f5e4bf3ec20dc4352497c7b73020efa`, parent checkpoint `05c047ccaafd83c6ddc96f5dc792ffd4f5fc194a`. That commit added five research/documentation files, with no application changes. This follow-up adds entry-point links and this checkpoint; its own resulting commit and CI must be checked independently. The original November 8 handover is retained below as historical evidence, not current PR, deployment or activation state.

### Documentation and accepted boundaries

- [Research log](simplicity/research.md): observations, decisions, uncertainty and source-review plans.
- [Modelling design](simplicity/design.md): proposed schemas and calculation boundaries, not implemented projection code.
- [Source inventory](../config/simplicity/sources.json): nine distinct fund identities and 18 source records; five KiwiSaver and four Investment funds. This is not a complete catalogue. Earlier conversation retrieval claims remain provisional; exact document contents, publication dates and identity require source-level review. Missing retrieval timestamps and content hashes remain null.
- [Documentation map](simplicity/documentation-map.md): original bundle/integration plan. Its local-preparation wording is historical; commit state is recorded here.
- [Project-instructions draft](simplicity/project-instructions.md): committed text, not an applied project-settings change.
- [Automation contract](automation-outcomes.md), [browser handover](simplicity-browser-status.md) and [release handover](simplicity-ui-release.md): separate evidence and action boundaries; their dated checkpoints do not verify later code or production.

Keep KiwiSaver and Investment identities and price series separate. AI extracts proposed parameters with evidence; deterministic tested code calculates. Preserve source versions, actual/target allocations, policy/observed hedging, exclusions, rounding and unknowns. Official observations, unpublished-price estimates and forward scenarios remain separate. No parameters in the initial inventory are approved for modelling; no fund is marked model-ready.

### Fresh repository observations and historical results

Retrieved through the GitHub connector on 2026-11-25 NZDT; these are existing remote records, not newly executed tests or live endpoint probes.

- PR #6 remains open, draft and unmerged at `36f3da2115d501700c8f6de64ded2a7afdfc5a73`: https://github.com/Lukestaz/stock-watch/pull/6. Its body references an older verification head; the actual head/check results take precedence.
- Head checks: `verify`, `compare-one-feed` and `public-preflight` failed; `alert-regressions` and one `browser-tests` job succeeded; the other `browser-tests` job was cancelled; three publishers were skipped. Do not combine these into a passing workflow. Verification: https://github.com/Lukestaz/stock-watch/actions/runs/45356067218 ; comparison: https://github.com/Lukestaz/stock-watch/actions/runs/45356067103 ; preflight: https://github.com/Lukestaz/stock-watch/actions/runs/45356067312 ; passing browser: https://github.com/Lukestaz/stock-watch/actions/runs/45356067454 ; cancelled browser: https://github.com/Lukestaz/stock-watch/actions/runs/45356067187 .
- A separate successful check is named `Health PASS build 95d31b2e7b640b66dceaee0f78f3086f06274122 funds 503/503`. Its name records health success alongside fund failures, not successful fund availability. No new health or fund request was performed for this documentation task.
- Retrieved `ci-results:simplicity/latest.json` describes main commit `95d31b2e7b640b66dceaee0f78f3086f06274122`, run `44380110002`, recorded `2026-11-18T19:24:28.512Z`: 79 Simplicity and 95 account/runtime tests, UI syntax and ten feeds passed then. It does not verify this documentation branch, PR #6 or current feed recovery.
- Retrieved `ci-results:simplicity-browser/latest.json` describes main commit `51e99d3bc598e99a42e74190cb845724b25cca90`, run `43551507860`, generated `2026-11-14T03:26:09.780Z`: 40 passed, zero failed/flaky/skipped. It is not current branch-matched evidence.
- PR #6 records a user-supplied provider reply of 2026-11-24: the unit-price file has a technical issue and is expected back in the next few days. This is not an independently retrieved incident notice, a guaranteed restoration date or proof of recovery. Retain the CSV integration and strict checks.

### Verification and delivery state

The inventory was reconstructed byte-for-byte against retrieved Git blob `1277c3d9a813a026967cf88926c416bcde16a294` and parsed locally. Checks confirmed nine unique identities, 18 source records, false model-readiness/price-mapping flags and preserved null retrieval timestamps/content hashes. Introduced relative-link destinations were checked against repository reads and the five-file commit listing; this was not a general Markdown/anchor or external-URL audit. The source inventory is unchanged by this integration.

No application, browser or feed tests were run, and no new CI was triggered by the preparation step. No branch-matched CI record was established. No runtime, workflow, release manifest, migration, model or alert configuration is changed. PR #6 is untouched. No merge, deployment, migration, project-settings update, notification or activation was performed by this documentation task. Current production deployment/activation state was not independently reverified.

### Concrete next steps

1. Review and commit the documentation integration with action-specific approval, then verify the resulting commit and any applicable checks; do not borrow old passing records.
2. Verify the complete official KiwiSaver and Investment catalogue through official document indexes. Preserve exact URLs, revisions and historical versions; do not infer that the nine inventoried updates exhaust the funds.
3. Retrieve source documents, record hashes/times/publication evidence, capture page-level passages and review allocations, hedging, fees and valuation assumptions before adopting model configurations. Unverified URL candidates and prior retrieval reports must not become approved inputs silently.
4. Define fund-specific market/FX proxies and availability cutoffs; backtest without look-ahead bias before considering numerical nowcasts. Keep forward scenarios separate and later. No accuracy or executable-switch-price claim is established.
5. Separately from research, resolve PR #6 failures. After provider recovery, verify CSV parsing, valuation date and history continuity, then Worker/D1 refresh independently. Resolve actual release pins/results before proposing any approved release. Do not weaken checks or silently substitute an estimate.
6. Apply project settings, open a PR, merge, deploy or activate anything only through separately approved actions.

## Historical checkpoint - 2026-11-08 NZDT

Everything below is preserved from the earlier handover. References to open PRs, unperformed deployment work and next steps describe that checkpoint only and may have been superseded.

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
