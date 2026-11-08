# Simplicity browser verification handover

Updated 2026-11-08 NZDT for PR #5. The dropdown-label fix at b80f918f2e34b8b064802654b87d0f8536d9bee5 is browser-verified under the synthetic test conditions below. The later CI/docs follow-up requires its own fresh checks; this is not production or live-D1 verification.

## Scope

The existing pinned Playwright harness runs twelve scenarios in chromium-desktop and webkit-mobile: 24 executions. API responses are synthetic, the static server binds to loopback, and intercepted requests allow only expected same-origin GETs. Unexpected origins, paths and non-GETs are blocked and fail assertions. No live provider, production API, personal holdings or notifications are used by these browser tests.

Coverage includes price/chart/table rendering, six KiwiSaver and four Investment choices, local history redraw, explicitly stale fallback, failed-refresh price removal, disabled preview, wrong-series and snapshot mismatch rejection, malformed JSON, network failure/retry, out-of-order responses even when abort is ignored, keyboard focus/refresh, viewport fit and 44px controls.

## Observed results

- First run 42420288469, number 1, attempt 1, tested 218b603105b4d7648489d050fb92379af8b60c68: 18 passed and 6 failed. Each browser failed the same three exact-label lookups. This remains historical failure evidence, not the latest result.
- Fixed run 42421257083, number 2, attempt 1, tested b80f918f2e34b8b064802654b87d0f8536d9bee5: 24 passed, zero failed, flaky or skipped. Each browser passed all 12 cases. Published at 2026-11-07T22:36:00.633Z (2026-11-08 11:36:00 NZDT). Run URL: https://github.com/Lukestaz/stock-watch/actions/runs/42421257083.
- GitHub's check-runs API subsequently confirmed success for the fixed browser job and its publisher. The broader dashboard browser PR job, run 42466677972, also reported success for that head; its PR publisher was skipped as intended. No test count for that broader run is asserted here.

The fix separates label text from populated select contents using standalone for="fund" and for="range" labels. Tests, exact-label locators, timeouts and skip policy were unchanged. The three formerly failing scenarios passed in both browsers.

## CI and retrieval

The follow-up configures .github/workflows/simplicity-browser.yml for matching pushes to main or feat/simplicity-fund-monitor and matching PRs targeting main. Tests remain contents:read. The separate writer runs only on trusted pushes to those refs in Lukestaz/stock-watch, never on PR events. Runner context appears only inside steps, not job-level env.

Read ci-results:simplicity-browser/latest.json, latest-successful.json or runs/<run-id>-<attempt>.json. Match testedCommit and sourceBranch before using counts, browsers or failures as evidence. Latest spans the two trusted push branches. PR evidence comes from GitHub checks and run artifacts because its publisher is skipped. Records describe the browser-test job, not an independently inferred overall workflow conclusion. Reports and synthetic failure artifacts have 30-day retention.

The shared dashboard summarizer retains its original defaults while accepting optional RESULTS_WORKFLOW, RESULTS_SOURCE_BRANCH and RESULTS_PREFIX. Node syntax and five synthetic summary checks passed before the original browser commit; those were not substituted for real browser execution.

## Next gate

After the CI/docs follow-up, verify fresh PR checks and trusted-push outcomes for its actual commit. Before merging, review any remaining integration failures; do not treat the previous app checkpoint as proof of new workflow configuration. Dashboard navigation remains unmodified. Preview/D1 discovery, remote migrations, deployment, feature activation and alert delivery require their separate reviews and approvals.
