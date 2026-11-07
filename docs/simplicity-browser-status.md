# Simplicity browser verification handover

Updated 2026-11-08 NZDT on feat/simplicity-fund-monitor. The first browser job ran and failed; its results were retrieved through the connector. A dropdown-label fix is prepared in this batch, but post-fix execution and publication remain unverified.

## Scope

Adds tests/dashboard/simplicity.spec.mjs to the existing pinned Playwright harness. Twelve scenarios run on both existing projects: chromium-desktop and webkit-mobile (24 intended executions). All fund responses are synthetic and served through intercepted same-origin GET requests. Unexpected origins, paths and non-GET requests are blocked and fail assertions. The static server binds to loopback. No live provider, production API, Cloudflare D1, personal holdings or notifications are used.

Coverage: successful price/chart/table rendering; six KiwiSaver and four Investment choices; local history-range redraw; explicitly stale fallback; failed refresh hiding the previous price; disabled preview; wrong-series and mismatched-snapshot validation; malformed JSON; failed request and retry; out-of-order response protection even when AbortController is ignored; keyboard focus/refresh; viewport fit and 44px controls.

## CI and evidence

.github/workflows/simplicity-browser.yml runs this spec only on feature-branch pushes affecting its source/harness/workflow. It preserves machine JSON and synthetic screenshots/traces/reports for 30 days. Only the separate trusted publisher has contents:write. Runner context is used only inside steps, not job-level env.

On ci-results, read simplicity-browser/latest.json, latest-successful.json or runs/<run-id>-<attempt>.json. Check testedCommit, sourceBranch, runId, runAttempt, jobResult, reportState, counts, browsers and failures. These describe the browser-test job, not the publisher's final overall workflow conclusion. Missing records or reports are not passes. The publisher preserves all other result folders and retries non-force ref conflicts.

The shared dashboard summarizer gains optional RESULTS_WORKFLOW, RESULTS_SOURCE_BRANCH and RESULTS_PREFIX inputs. Existing dashboard defaults remain unchanged. Node syntax checks and five synthetic summarizer cases passed locally before the first browser commit; actual Chromium/WebKit execution has not been performed locally.

## First observed browser result

Connector retrieval of simplicity-browser/latest.json confirmed run 42420288469, run number 1, attempt 1, tested commit 218b603105b4d7648489d050fb92379af8b60c68, generated 2026-11-07T22:25:50.260Z (2026-11-08 11:25:50 NZDT). Run URL: https://github.com/Lukestaz/stock-watch/actions/runs/42420288469.

The browser job and outcome were failed. There were 18 passes, 6 failures, zero flaky and zero skipped results. Chromium desktop and WebKit mobile each reported 9 passes and 3 failures. Report state was available, with no top-level report errors. Successful publication of a failure record does not make the tests pass.

Both browsers failed the same three scenarios: history-range selection, out-of-order fund selection and keyboard focus. Their errors showed exact getByLabel lookups for History or Fund could not find an element. The affected interaction assertions therefore remain unverified.

## Label fix and next gate

site/simplicity.html now separates label text from populated select contents using standalone label for="fund" and label for="range" elements. Wrapper divs retain the grouped controls. This targets the observed label-lookup failures; the tests, exact-label locators, timeouts and skip policy are unchanged. No JavaScript data/loading logic is changed.

Read the new browser result after the approved commit, verify its testedCommit, and require all 24 cases to pass before calling the page browser-verified or adding a stock-dashboard navigation link. In particular, review keyboard and viewport results after the markup change. The old failed run is not evidence about the fixed commit.

This follow-up changes only dropdown-label markup and this handover. No dashboard navigation, deployment, feature flag, remote migration or alert activation is changed. Continue with genuinely isolated preview/D1 discovery only after browser review, as described in docs/simplicity-status.md.
