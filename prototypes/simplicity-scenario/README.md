# Local hypothetical scenario MVP

From repository root, run node prototypes/simplicity-scenario/serve.mjs and open http://127.0.0.1:4174. Load synthetic demo, acknowledge assumptions and calculate. Its invented arithmetic gives 1.026000, not a fund prediction. Real-fund prices, dates, weights, returns and fees remain manual. No provisional allocation is auto-approved.

Unit/HTTP/reporting tests:
```
node --test prototypes/simplicity-scenario/engine.test.mjs prototypes/simplicity-scenario/serve.test.mjs prototypes/simplicity-scenario/verify-browser-report.test.mjs prototypes/simplicity-scenario/publisher.test.mjs
```
Pinned browser suite (existing Playwright 1.64.1 and both Chromium/WebKit):
```
node tests/dashboard/node_modules/@playwright/test/cli.js test --config prototypes/simplicity-scenario/browser.config.mjs
```
Do not downgrade, skip or weaken checks.

## Verified checkpoint

For source 149d17e1d60b26dc3b006594916d0106ce4bef4c, run 45536528350/1 reports test job success and 14 browser cases passed, zero failed/skipped/flaky, with passing validation. The trusted automatic result was read directly from ci-results:simplicity-scenario/latest.json and its permanent runs/45536528350-1.json record. Whole-workflow conclusion remains unknown while publishing; this is not deployment evidence. Older c9550fa results remain user-supplied evidence. Every later commit needs matching fresh checks.

See [integration review](../../docs/simplicity/integration-review.md) and [retrieval contract](../../docs/automation-outcomes.md). Main's newer public-data updates do not overlap the reviewed prototype paths, but no Git merge simulation or general production-readiness certification was performed. Tests/PRs remain read-only. Only trusted feature-branch pushes publish bounded results; newer failures replace older passes in latest while immutable attempt records remain. Missing/unmatched/stale reports cannot establish success. Main-push publication is not enabled by this prototype.

The local server is loopback-only with whitelisted assets and no provider/account/D1 access. Keep exports private and do not expose it publicly. Cumulative gross NZD total-return assumptions already include distributions, FX and hedging effects; do not double-count them or fees. Unlisted returns must be explicit. Fixed starting weights, calendarDays/365 fees, six-decimal weighting and IEEE-754 outputs are prototype conventions, not production NAV accounting. No tax/cash-flow/rebalancing/interval/accuracy model is established. Unknowns are rejected, not zeroed/normalised. Official prices are never replaced; nowcasts remain unavailable. No PR creation, merge, deployment or alert/nowcast activation is authorised.
