# Isolated hypothetical scenario engine

First implementation slice: engine.mjs and engine.test.mjs. The prepared UI, loopback server and browser harness are not included in this commit. No production integration or nowcast is implemented.

From the repository root run:

```
node --test prototypes/simplicity-scenario/engine.test.mjs
```

The engine imports the existing runtime catalogue read-only and preserves distinct KiwiSaver/Investment identities. All real-fund reference prices, weights, returns and fees are explicit user assumptions; no provisional disclosure weights are adopted automatically.

Returns must be cumulative gross NZD total returns for the entire horizon, already including distributions, FX and hedging effects. Do not apply FX or the same fee twice. Unlisted returns also require explicit assumptions. Starting weights are fixed. The explicit fee compounds using calendarDays/365. No tax, cash flows, rebalancing, intervals or accuracy claims.

Input numbers allow six decimal places. Weight aggregation uses BigInt fixed point; fee/output arithmetic uses IEEE-754, not production NAV accounting. Weights must total exactly 100%; missing values are not zero or silently normalised. Unknown identities, dates, return bases and nowcast requests are rejected. Results retain input assumptions and explicit scenario/nowcast-readiness flags.

Local tests on 2026-11-25: 30/30 Node tests passed, zero failed/skipped/cancelled. The separate prepared UI/server had 8 HTTP checks and 7 Chromium UI checks pass using Python Playwright 1.51.0. WebKit's executable was absent and its cases did not execute. These are not results from the repository-pinned Node Playwright 1.64.1 runner, which remains pending.

This directory is outside production site assets. No Worker, D1, workflow, manifest, account, provider or alert integration is changed. The next slice is the separately reviewed UI/server/browser harness, followed by the pinned Chromium/WebKit run and current-main integration review. No merge, deployment, notification or activation is implied.
