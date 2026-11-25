# Simplicity feature handover

## Pinned browser execution integration - 2026-11-25 NZDT

Authoritative checkpoint, not production-health evidence. Prototype branch inspected at 43d35dc5c9387e389f3447fb96cd7be3698c353d. Main inspected at b29e56c236dbf65c2e1e577bb9fe668f15bac0f2. Complete preceding implementation/history:
https://github.com/Lukestaz/stock-watch/blob/43d35dc5c9387e389f3447fb96cd7be3698c353d/docs/simplicity-status.md

[Prototype run instructions and evidence](../prototypes/simplicity-scenario/README.md). The committed MVP supports manual hypothetical scenarios only; official observations, unpublished-price estimates and forward scenarios stay distinct. No disclosure inputs are approved, no numerical nowcast is enabled and no executable-switch-price or accuracy claim is established.

## Observed integration gaps and proposed fixes

- The dashboard workflow's path filters omit prototypes/**, so the prototype suite had no automatic browser job. Add [.github/workflows/simplicity-scenario-prototype.yml](../.github/workflows/simplicity-scenario-prototype.yml): prototype-branch pushes and matching main-target PRs, contents:read, credential-free checkout, no repository publisher or deployment steps, twenty-minute job bound. The approved commit will trigger that test job; it can use Actions minutes and download pinned dependencies/browser/system packages.
- Dashboard package-lock.json is absent. Follow its existing workflow's npm install --ignore-scripts --package-lock=false approach; verify the existing exact 1.64.1 pin and install both Chromium and WebKit. No silent downgrade, conditional skip or continue-on-error is permitted.
- Browser request interception previously aborted unexpected requests without asserting their absence. Updated guards fail on unexpected requests or page errors. Catalogue count follows the imported catalogue rather than hard-coding a supposedly exhaustive count.
- Browser report/trace paths become absolute repository-root paths, removing working-directory ambiguity. A tested validator requires exactly seven named cases in each required project and zero failures, retries, expected failures, skips, flakes or global errors. Missing reports produce a failed source/run-tagged summary. Synthetic JSON and traces are retained as Actions artifacts for seven days, not published to ci-results.

## Current verification state

The exact pinned Node Playwright startup was attempted in an isolated local build and failed because its installed dependencies were absent. It did not execute browser cases. This preparation does not claim that GitHub has run or passed the proposed workflow, that the npm pin resolves, or that WebKit starts. The existing local WebKit-executable blocker remains unresolved until actual CI execution.

Report-validator tests: 13/13 synthetic Node tests passed; missing-report CLI handling exited 1 and wrote outcome=failed. JavaScript syntax, YAML parsing/custom policy checks and shell syntax passed. These are not GitHub workflow validation, browser execution or application regressions. Earlier 38 Node and Chromium-only results in [verification.json](../prototypes/simplicity-scenario/verification.json) remain historical and do not verify the modified harness.

Shared-file comparison against inspected main: runtime catalogue blob 5f2e6278b5909421228bcf65b6e0b591496fcaa4 and tests/dashboard/package.json blob 205741eba6a86fa99d051fab4b08977c626e0264 match the prototype. This does not establish mergeability or comprehensive integration health. No merge/rebase was performed. No production or provider endpoints were probed; no migrations, project-settings edits, notifications, alert activation or release changes were performed. PR #6 and its previously recorded failing/cancelled checks remain separate, not overridden by prototype tests.

## Next verification gate

Approve and commit the single integration batch, then inspect the triggered run for its actual source commit, full job conclusion, step failures and artifact summary. Require all fourteen pinned Chromium/WebKit executions and zero skipped/flaky results. Keep dependency/setup/launch failures visible. Do not invent run IDs or reuse old passing records. Update this checkpoint only after that new evidence is retrieved.

Before any merge, review current-main differences and any remaining account/runtime implications. PR creation, merge, deployment and nowcast activation need separate approval. Research/source review remains incomplete: [research](simplicity/research.md), [design](simplicity/design.md), [inventory](../config/simplicity/sources.json). Preserve scheme identity, exact URLs, versions, dates, hashes, evidence passages, actual/target allocations, hedging distinctions and unknowns. Fund readiness requires reviewed dated inputs/proxies/cutoffs and backtesting without look-ahead bias.
