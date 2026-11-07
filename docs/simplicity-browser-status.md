# Simplicity browser verification handover

Prepared 2026-11-08 NZDT on feat/simplicity-fund-monitor. Browser execution and publication for this batch are pending; syntax checks are not browser verification.

## Scope

Adds tests/dashboard/simplicity.spec.mjs to the existing pinned Playwright harness. Twelve scenarios run on both existing projects: chromium-desktop and webkit-mobile (24 intended executions). All fund responses are synthetic and served through intercepted same-origin GET requests. Unexpected origins, paths and non-GET requests are blocked and fail assertions. The static server binds to loopback. No live provider, production API, Cloudflare D1, personal holdings or notifications are used.

Coverage: successful price/chart/table rendering; six KiwiSaver and four Investment choices; local history-range redraw; explicitly stale fallback; failed refresh hiding the previous price; disabled preview; wrong-series and mismatched-snapshot validation; malformed JSON; failed request and retry; out-of-order response protection even when AbortController is ignored; keyboard focus/refresh; viewport fit and 44px controls.

## CI and evidence

.github/workflows/simplicity-browser.yml runs this spec only on feature-branch pushes affecting its source/harness/workflow. It preserves machine JSON and synthetic screenshots/traces/reports for 30 days. Only the separate trusted publisher has contents:write. Runner context is used only inside steps, not job-level env.

On ci-results, read simplicity-browser/latest.json, latest-successful.json or runs/<run-id>-<attempt>.json. Check testedCommit, sourceBranch, runId, runAttempt, jobResult, reportState, counts, browsers and failures. These describe the browser-test job, not the publisher's final overall workflow conclusion. Missing records or reports are not passes. The publisher preserves all other result folders and retries non-force ref conflicts.

The shared dashboard summarizer gains optional RESULTS_WORKFLOW, RESULTS_SOURCE_BRANCH and RESULTS_PREFIX inputs. Existing dashboard defaults remain unchanged. Node syntax checks and five synthetic summarizer cases passed locally; actual Chromium/WebKit execution has not been performed locally.

## Next gate

Read the new browser result after the approved commit. Fix failures before adding a stock-dashboard navigation link or calling this browser-verified. No application code, dashboard navigation, deployment, feature flag, remote migration or alert activation is changed by this batch. Continue with genuinely isolated preview/D1 discovery only after browser review, as described in docs/simplicity-status.md.
