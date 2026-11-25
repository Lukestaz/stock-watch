# Local hypothetical scenario MVP

Run locally from the repository root:

```
node prototypes/simplicity-scenario/serve.mjs
node --test prototypes/simplicity-scenario/engine.test.mjs prototypes/simplicity-scenario/serve.test.mjs prototypes/simplicity-scenario/verify-browser-report.test.mjs
```

Open http://127.0.0.1:4174. Load synthetic demo, accept the assumptions and calculate. The invented 60/40, +5%/-1%, zero-fee fixture gives 1.026000, not a fund prediction. Real-fund reference prices, dates, weights, returns and fees remain manual hypothetical inputs. Catalogue identities are imported read-only; no disclosure parameters are auto-approved.

Returns are cumulative gross NZD total returns over the whole horizon, already including distributions, FX and hedging effects. Do not add FX or deduct an embedded fee twice. Unlisted returns need explicit assumptions. Starting weights are fixed; fee compounds over calendarDays/365. No tax, cash flows, rebalancing, intervals or accuracy claims. Six-decimal fixed-point weighting is followed by IEEE-754 fee/output arithmetic, not production NAV accounting. Missing values are rejected, not zeroed/normalised. Official prices are never replaced and nowcasts remain unavailable.

The development server binds to loopback and serves only whitelisted assets/catalogue. No account, provider, D1, notification or production route is used. Keep exports private; do not expose this server publicly.

## Exact pinned browser execution

The new prototype-only workflow installs the existing tests/dashboard pin with lifecycle scripts disabled and no lockfile changes, verifies @playwright/test 1.64.1, installs Chromium and WebKit, then runs:

```
node tests/dashboard/node_modules/@playwright/test/cli.js test --config prototypes/simplicity-scenario/browser.config.mjs
node prototypes/simplicity-scenario/verify-browser-report.mjs scenario-browser-results.json scenario-browser-summary.json
```

There is no committed dashboard package-lock.json, so this follows the existing dashboard workflow's npm install --package-lock=false approach, not npm ci. No dependency pin is changed. Dependency resolution or browser installation failure must fail the job, not trigger a downgrade or skip.

The harness requires seven cases in each of desktop Chromium and mobile WebKit, retries zero. Unexpected requests and page errors fail tests. Report/trace paths are repository-root absolute paths. The validator requires all 14 distinct cases to pass, with no expected failures, retries, skips, flaky results or global errors. Missing reports produce a failed provenance summary. Summary files identify the source SHA/ref and run/attempt; artifacts retain synthetic reports/traces for seven days. The job has contents:read, no repository publisher, secrets, deployment or notification steps. The approved commit triggers its prototype-branch push job; matching future main-target PRs also run it.

## Evidence, not completion claims

At preparation head 43d35dc5c9387e389f3447fb96cd7be3698c353d, exact pinned runner startup failed locally because node_modules were absent. The pinned suite has not executed here and no new GitHub run is claimed. The report validator passed 13 synthetic Node tests; missing-report CLI handling exited 1 and wrote a failed summary. These do not establish Playwright execution. Earlier engine/HTTP/Chromium results remain in verification.json as historical local evidence; they do not verify these harness changes.

Compared shared catalogue and runner manifest against main b29e56c236dbf65c2e1e577bb9fe668f15bac0f2: both Git blobs match. This is a limited integration check, not a merge simulation or general regression result. Review the new workflow's actual logs, JSON/artifact summary and branch SHA before reporting success. PR #6 and production remain untouched; merge, deployment and activation need separate approval.
