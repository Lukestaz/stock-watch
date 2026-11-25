# Local hypothetical scenario MVP

From the repository root:

```
node prototypes/simplicity-scenario/serve.mjs
node --test prototypes/simplicity-scenario/engine.test.mjs prototypes/simplicity-scenario/serve.test.mjs
```

Open http://127.0.0.1:4174. Load synthetic demo, acknowledge the assumptions and calculate. The invented 60/40, +5%/-1%, zero-fee fixture gives 1.026000, not a fund prediction. All 17 real-fund identities are imported from the existing catalogue; their weights, reference prices, dates, returns and fees must be supplied manually. No disclosure extraction is auto-approved.

The server binds to loopback and serves only whitelisted prototype assets/catalogue. No account, database, provider, alert or production route is used. Keep exported assumptions private; no persistence or automatic upload occurs. Do not expose this development server publicly.

Inputs are cumulative gross NZD total returns over the selected horizon, already including distributions, FX and hedging effects. Do not add FX or deduct an embedded fee twice. Unlisted returns require explicit assumptions. Starting weights are fixed; fee compounds over calendarDays/365. No tax, cash flows, rebalancing, intervals or accuracy claims. Six-decimal fixed-point input weighting is followed by IEEE-754 fee/output arithmetic, not production NAV accounting. Unknown values are rejected, not zeroed or normalised. Scenarios never replace official prices; nowcasts remain unavailable.

## Browser suite

Reuse existing tests/dashboard dependencies, pinned to @playwright/test 1.64.1:

```
node tests/dashboard/node_modules/@playwright/test/cli.js test --config prototypes/simplicity-scenario/browser.config.mjs
```

The config requires both desktop Chromium and mobile WebKit, retries zero. Setup/launch failures must remain failures, not conditional skips. No dependency versions, workflows or release gates are changed.

Local preparation on 2026-11-25: 38/38 Node tests (30 engine, 8 HTTP) passed; JavaScript syntax passed. Equivalent browser cases executed using Python Playwright 1.51.0: 7 desktop-Chromium and 7 mobile-emulated-Chromium cases passed. Mobile Chromium is not WebKit/iOS verification. WebKit launch failed because its binary was absent, leaving 7 cases not executed. The pinned Node runner was attempted but could not start because its dependencies were absent in the isolated build. These are not CI results. See verification.json.

Engine source and tests match commit 4adb3db74e310cd519748dc6eef0e4ea03ba9f76. This remaining batch adds UI, server, HTTP/browser harness and documentation outside site/. No merge, deployment, migration, alert/nowcast activation, project-settings change or PR #6 modification is included. Next: execute the pinned suite including WebKit, then review against current main before separate release decisions.
