# Local hypothetical scenario MVP

From repository root, run node prototypes/simplicity-scenario/serve.mjs and open http://127.0.0.1:4174. Load synthetic demo, acknowledge assumptions and calculate. Its invented arithmetic gives 1.026000, not a fund prediction. Real-fund reference prices, dates, weights, returns and fees remain manual. No provisional allocation is auto-approved.

Unit/HTTP/reporting tests:
```
node --test prototypes/simplicity-scenario/engine.test.mjs prototypes/simplicity-scenario/serve.test.mjs prototypes/simplicity-scenario/verify-browser-report.test.mjs prototypes/simplicity-scenario/publisher.test.mjs
```
Pinned browser suite:
```
node tests/dashboard/node_modules/@playwright/test/cli.js test --config prototypes/simplicity-scenario/browser.config.mjs
```

Use existing @playwright/test 1.64.1 and both Chromium/WebKit. Do not downgrade, skip or weaken checks. Source c9550fa had 14 browser cases and validator pass according to user-supplied evidence, preserved on ci-results. The publisher change needs its own run; no fresh CI success is claimed.

Tests stay read-only. Only the trusted prototype-push publisher writes bounded summaries to ci-results:simplicity-scenario/. Newer failures replace older passes in latest; immutable per-attempt records remain. Missing/unmatched reports cannot pass. Whole-workflow conclusion remains unknown while publishing. See docs/automation-outcomes.md for retrieval, provenance and trust limitations. PRs cannot publish; traces remain Actions artifacts.

The local server is loopback-only, with whitelisted assets and no provider/account/D1 access. Keep exports private; do not expose it publicly. Cumulative gross NZD total-return assumptions already include distributions, FX and hedging effects; do not double-count them or fees. Unlisted returns must be explicit. Fixed starting weights, calendarDays/365 compound fees, six-decimal input weighting and IEEE-754 outputs are prototype conventions, not production NAV accounting. No tax/cash-flow/rebalancing/interval/accuracy model is established. Unknowns are rejected, not zeroed or normalised. Official prices are never replaced; nowcasts remain unavailable. No merge, deployment or alert/nowcast activation is authorised.
