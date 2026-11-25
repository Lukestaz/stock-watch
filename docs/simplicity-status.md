# Simplicity feature handover

## Complete local prototype batch - 2026-11-25 NZDT

Authoritative checkpoint, not production-health evidence. Branch: feat/simplicity-scenario-prototype. Inspected implementation head: 4adb3db74e310cd519748dc6eef0e4ea03ba9f76 (engine, 30 tests and instructions). This batch adds the remaining UI, local server, HTTP/browser harness and documentation together. Verify the resulting commit after approval; no branch-matched CI success is established.

Previous complete checkpoint and history:
https://github.com/Lukestaz/stock-watch/blob/4adb3db74e310cd519748dc6eef0e4ea03ba9f76/docs/simplicity-status.md
That immutable record links the superseded November 8 and November 25 handovers. Historical release/CI evidence remains historical, not proof of current production state.

## Implementation and scope

[Run the prototype](../prototypes/simplicity-scenario/README.md). Files are isolated under prototypes/simplicity-scenario, outside site/. The existing engine/tests and 17-identity runtime catalogue are unchanged. Scheme/fund identities remain distinct. All real-fund reference prices, weights, returns and fees are manual hypothetical assumptions; provisional disclosure parameters are not automatically adopted.

The UI supports editable components, explicit acknowledgement, validation errors, contributions and JSON export. Input edits clear results; fund changes clear assumptions as well. Outputs are forward_scenario only, with nowcastAvailable=false and approvedForModelling=false. Missing inputs are never zeroed/normalised; official prices/history are not replaced. Unpublished-price nowcasts, market proxies, validated anchors and accuracy intervals remain unimplemented.

The development server binds only to 127.0.0.1, whitelists assets and rejects foreign Host values/non-GET requests. No account, D1, provider or alert integration is added. Production UI, Workers, workflows, release manifests, source inventory and private data are untouched. No PR creation, merge, rebase, deployment, migration, project-settings update, notification or activation is included.

## Verification

[Machine-readable record](../prototypes/simplicity-scenario/verification.json). Local preparation: 38 Node tests passed (30 existing engine and 8 new real HTTP tests), zero failed/skipped/cancelled; module syntax passed. Engine, tests and catalogue were reconstructed byte-for-byte against retrieved Git blob hashes before execution.

Python Playwright 1.51.0 ran seven cases each in real desktop Chromium and mobile-emulated Chromium: 14 passed. Coverage: catalogue/nowcast separation, arithmetic and invalidation, scheme isolation, missing returns, acknowledgement, export provenance and viewport/keyboard navigation. Mobile Chromium is not mobile WebKit/iOS verification.

WebKit launch failed because its executable was absent; seven cases were not executed, not passed. The repository-pinned Node Playwright 1.64.1 runner was attempted but its dependencies were absent in the isolated build, so it did not start. The checked-in harness still requires Chromium and WebKit with no conditional skips. No browser/dependency downloads or CI dispatch occurred. No production/account regression suite or live feed probe ran. Fixed-point input weighting and IEEE-754 fee/output arithmetic are not production NAV validation.

PR #6 check results retrieved during this preparation still show verify, compare-one-feed and public-preflight failures, one successful and one cancelled browser job, successful alert regressions and three skipped publishers. Those are unrelated existing release results, not prototype CI or evidence of feed recovery. They remain visible and unchanged.

## Research and next gates

[Research](simplicity/research.md), [design](simplicity/design.md), [source inventory](../config/simplicity/sources.json), [automation](automation-outcomes.md), [historical browser record](simplicity-browser-status.md), [historical release record](simplicity-ui-release.md) and [project-instructions draft](simplicity/project-instructions.md) remain separate. The nine-fund source inventory is provisional/non-exhaustive; later chat-only fund evidence is not silently claimed as committed.

1. Approve the complete remaining batch once, then verify its resulting commit and exact file scope.
2. Install/use the repository-pinned dependencies in an approved execution environment and run both Chromium and mobile WebKit. Preserve blockers/failures; do not weaken checks for a green result.
3. Review against current main without mixing PR #6 release work into the prototype. Obtain separate approvals for PR creation, merges, deployment and activation.
4. Persist and independently review exact source URLs, versions, reporting/publication/effective dates, retrieval times, hashes, passages, classifications, actual/target allocations, hedging, exclusions, rounding and unknowns. Fund-specific readiness requires dated allocations, fees, market/FX proxies, unlisted assumptions and valuation cutoffs, then backtesting without look-ahead bias. Scenarios stay separate from nowcasts.
5. Resolve release/feed failures independently: after provider recovery verify CSV continuity and Worker/D1 refresh, then actual release pins/results. Never substitute a scenario for a missing official or executable switch price.
