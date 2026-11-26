# Simplicity feature handover

Updated 2026-11-08 NZDT for PR #5: https://github.com/Lukestaz/stock-watch/pull/5. Source branch: feat/simplicity-fund-monitor. Last verified application checkpoint: b80f918f2e34b8b064802654b87d0f8536d9bee5. The subsequent CI/docs follow-up is not covered by those earlier results until its own checks complete.

Updated 2026-11-26 NZDT on branch fix/simplicity-cloudfront-feeds (from main 20529aa, PR #8) for the feed source change described in the next section. That branch is not merged, deployed or enabled. Check results for code head f33b0d5 and docs commit d98bca7 are recorded in the next section. Checks for the commit that added this text have not been read.

## 2026-11-26 feed source change (proposed, not merged)

### Observed facts

- The previous endpoint, https://simplicity.kiwi/api/download_prices?fund_name=..., returned HTTP 404 with an HTML body for all ten configured feeds in the Simplicity feed diagnostics verification job (run number 29 on PR #7, 2026-11-26; log pasted by the repository owner). An earlier attached record dated 2026-11-23 shows nine feeds at HTTP 404 and Investment Balanced with no status (a timeout). Neither is a retrieved CI record on ci-results; both are owner-supplied.
- The owner reports that the fund pages carry restored "Download unit price history" buttons whose links point at https://d1g0vrcwq8cgqg.cloudfront.net/unit-prices/<file>.csv, and supplied the file names in the table below. This is owner-supplied and was not read from the live page by the assistant; the page text retrievable by the assistant does not show link targets.
- On 2026-11-26 between about 22:06 and 22:25 NZDT the assistant requested these URLs through a text retrieval tool. Fifteen of the sixteen loaded; nzshare.csv failed three times through that tool (no status code is available, so this is not evidence of a 404). Actions later read nzshare.csv (see the run summary below). The tool's output limit cut off six long files, and the latest dates it showed for some other series (2026-11-23) are superseded by the Actions summary below.
- For the series where both were retrieved, the opening prices of each new file matched the previous endpoint's response, and later overlapping values matched for High Growth, Default, Defensive and Investment High Growth. This shows continuity of data; it is not identity verification.
- The CSV layout (header Date,Price, DD-MM-YYYY dates, a blank line after each group of six rows) is accepted by the existing parser, which skips blank lines. This is shown by reading the parser and by a new test.
- Check results for PR #8, read through the GitHub connector (check-run data). At code head f33b0d5 (started 2026-11-26 09:42 UTC, 22:42 NZDT): the `verify` job (Simplicity feed diagnostics, run 45794459991, job 139821437813) concluded success in 22 seconds, `alert-regressions` succeeded and `publish-summary` was skipped, as expected for a pull request. After the docs commit d98bca7 (started 09:46 UTC, 22:46 NZDT): `verify` (run 45795072687, job 139823517744) succeeded in about 18 seconds, `alert-regressions` succeeded (run 45795072653) and `publish-summary` was skipped. The head SHA of run 45795072687 was not read; it is attributed to d98bca7 from its start time. The PR reported a clean mergeable state at the earlier head. The job logs were not read by the assistant.
- Run 45795072687 job summary ("Simplicity public-feed snapshots"), pasted by the repository owner and not independently retrieved: all sixteen series returned HTTP 200 and parsed, all with latest observation 2026-11-24 and freshness unchecked. High Growth launch-price sanity checks matched for KiwiSaver and Investment; the other fourteen have no check configured, so for them only parsing succeeded. Test counts have not been seen. Figures are in the table below.

### Series-to-file mapping and run 45795072687 summary (16 series)

| Series | File | Bytes read | Parsed rows | Latest price (2026-11-24) |
|---|---|---|---|---|
| KiwiSaver High Growth | highgrowth.csv | 16020 | 895 | 1.6093 |
| KiwiSaver Growth | growth.csv | 45870 | 2563 | 2.4331 |
| KiwiSaver Balanced | balanced.csv | 45848 | 2563 | 1.944 |
| KiwiSaver Default | default.csv | 22239 | 1244 | 1.2757 |
| KiwiSaver Conservative | conservative.csv | 45878 | 2563 | 1.427 |
| KiwiSaver Defensive | defensive.csv | 16005 | 895 | 1.1571 |
| Investment High Growth | invhighgrowth.csv | 16017 | 895 | 1.6052 |
| Investment Growth | invgrowth.csv | 43140 | 2409 | 2.276 |
| Investment Balanced | invbalanced.csv | 43094 | 2409 | 1.8683 |
| Investment Conservative | invconservative.csv | 43126 | 2409 | 1.3831 |
| Investment NZ Share | nzshare.csv | 38770 | 2167 | 1.6197 |
| Investment NZ Bond | nzbond.csv | 38768 | 2167 | 1.1904 |
| Investment NZ Cash | invnzcash.csv | 16023 | 895 | 1.1359 |
| Investment Hedged Global Share | invhedgedglobalshare.csv | 16047 | 897 | 1.6963 |
| Investment Unhedged Global Share | invunhedgedglobalshare.csv | 16047 | 897 | 1.9471 |
| Investment Hedged Global Bond | invhedgedglobalbond.csv | 16037 | 897 | 1.0691 |

All files are under https://d1g0vrcwq8cgqg.cloudfront.net/unit-prices/. File names are irregular and are mapped explicitly, never derived from fund names. KiwiSaver and Investment series remain distinct identities and price series. Byte, row and price figures are from the owner-supplied summary.

### Decisions in this change

- The fetcher accepts only the exact origin above, a path of the form /unit-prices/<lowercase letters>.csv, and no query string, credentials or fragment. Redirect refusal, the size cap, the timeout and the HTML/JSON rejection are unchanged.
- The old simplicity.kiwi endpoint is no longer accepted. It is recorded here as superseded and is not kept as a silent fallback.
- The feed list has sixteen entries instead of ten, and the feeds diagnostic compares its report count with that list instead of a fixed ten. Adding the six Investment entries makes those series requestable at /api/v1/fund when SIMPLICITY_READ_ONLY is on. Monitoring and alerts stay disabled for all of them.
- The feed evidence entries record downloadStatus as unverified until an Actions run shows otherwise. The earlier 2026-11-07 evidence is not reused for the new URLs, and the entries have not been changed to a passed status on the strength of the check results above.

### Inferences, unresolved questions and limits

- Investment Homes and Income has no download button according to the owner. It has no feed configuration, no URL is guessed, and it stays catalogue-only.
- The new host is a CDN distribution identifier, not a Simplicity-owned name, so it could change. Origin and path validation live in one fetcher constant and one feed list.
- All sixteen files showed 2026-11-24 in Actions, while the assistant's earlier tool reads showed 2026-11-23 for some. The likeliest explanation is later publication; this is not confirmed. No publication schedule is assumed and freshness stays unchecked unless an expected date is supplied.
- Hedged and unhedged global share files have identical byte and row counts (16047 bytes, 897 rows) with different latest prices. This is regarded as formatting, not duplication; the files have not been compared.
- Content hashes were not recorded: the files exceed what the retrieval tool returns and the analysis sandbox has no network access.
- Fund identity is unverified for every series. The 2026 annual reports list 31 March 2026 unit prices, which could be used for an independent check; that has not been done.
- The job logs and test counts have not been seen. The per-series results rely on the owner-pasted summary.

## Outcome and review

Read-only fund ingestion, D1 persistence, a gated API, standalone UI and agent-readable CI reporting are implemented. The page passed synthetic desktop/mobile browser tests at the checkpoint above. PR #5 is open, not merged. No remote migration, preview/production deployment, feature activation or alert delivery was performed as part of this work. Verify current remote state before rollout.

The complete original PR diff against main at 16daf175ab036ca604803dca65761a9e2924cc33 was statically reviewed: 34 files, 1,640 additions, two deletions, 16 commits. No obvious application-code blocker was found; this is not formal approval or proof that all runtime risks are excluded. Findings were branch-only Simplicity CI and outdated handovers. This follow-up extends CI to PR/main and refreshes the handovers; fresh checks are required before closing those findings.

## Implementation map

- worker/src/simplicity-catalogue.mjs: six KiwiSaver and eleven Investment identities; monitoring and alerts remain disabled.
- simplicity-history.mjs and simplicity-fetch.mjs: explicit series identity, validated CSV, bounded downloads and timeout. The fetcher validates the feed origin and path (see the 2026-11-26 section).
- simplicity-feed-health.mjs and simplicity-snapshot.mjs: sixteen download-evidence mappings (ten before 2026-11-26), explicit expected-date freshness assessment and compact snapshots. identityVerified and alertEligible remain false.
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

The ten downloaded feeds at that checkpoint are KiwiSaver High Growth, Growth, Balanced, Default, Conservative and Defensive; Investment High Growth, Growth, Balanced and Conservative. At the checkpoint they reported latest observation 2026-11-04. Those results used the earlier simplicity.kiwi endpoint, which has since returned HTTP 404 (see the 2026-11-26 section). Shared High Growth launch-price checks are sanity checks, not independent identity verification.

## Remaining limitations

- Publication freshness is unchecked unless an expected date is explicitly supplied. No provider publication schedule or holiday policy is established; cache TTL does not establish observation freshness.
- Independent feed identity verification is incomplete. Parsing success and a shared launch price cannot enable alerts.
- Investment Homes and Income has no download link (owner-reported 2026-11-26). The six other previously unresolved Investment mappings now have owner-supplied links; the PR #8 verify jobs succeeded with them and the owner-supplied summary shows HTTP 200 for all sixteen (see the 2026-11-26 section), but the logs were not read by the assistant. Catalogue presence is not endpoint verification.
- Live D1 SQL, migration application, cold/warm API reads, durable remote coordination and deployment bindings remain unverified. Do not assume a preview DB is isolated or reuse production silently.
- Personal positions, re-entry rules, persistent fund-alert delivery and scheduled fund monitoring are not implemented. Earlier illustrative thresholds were not adopted.

## Next steps and boundaries

1. Verify fresh CI on the follow-up commit, including read-only PR tests and skipped PR publishers; review mergeability and the current diff before any separate merge approval.
2. Read docs/automation-outcomes.md and docs/simplicity-browser-status.md; always match result branch/commit, rather than accepting an old latest-successful record.
3. Prepare dashboard navigation only as a separate reviewed change. Discover a genuinely non-production D1 target and deployment configuration before proposing preview work.
4. Obtain explicit approval for resolved migration/deployment targets; apply 0005 only to the approved database, deploy approved preview and verify gating, persistence and failures.
5. Resolve independent identity and publication-freshness policy before alert activation. Keep public prices separate from user-scoped financial data.

The reviewed app deployment workflow is manual and pinned to a separate release; this PR is not deployment approval. No merge, deployment, migration, provider setup or notification action is authorised by the CI/docs follow-up.
