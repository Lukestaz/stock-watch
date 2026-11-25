# Simplicity feature handover

## JavaScript engine checkpoint - 2026-11-25 NZDT

Authoritative consolidated checkpoint, not production-health evidence. Target branch: feat/simplicity-scenario-prototype, inspected at 429cbfbd86a70d2f578fed129075350b1d13d4ca, branched from docs/simplicity-all-funds. Main has advanced independently. Verify the resulting implementation commit and applicable CI after the approved write; no merge or rebase is included.

The complete superseded checkpoint, including the original November 8 implementation, source limitations, CI and release evidence, is preserved at this immutable revision:
https://github.com/Lukestaz/stock-watch/blob/429cbfbd86a70d2f578fed129075350b1d13d4ca/docs/simplicity-status.md

## Implementation slice

[Prototype engine and instructions](../prototypes/simplicity-scenario/README.md): deterministic hypothetical forward-scenario calculator and 30 Node tests. It imports the existing 17-identity runtime catalogue read-only; this does not establish new official-catalogue completeness. All real-fund reference prices, weights, returns and fees are manual assumptions. No disclosure extractions are auto-approved or loaded. Missing inputs are rejected, not zeroed or normalised. Results retain assumptions and explicit forward_scenario, nowcastAvailable=false and approvedForModelling=false markers.

This first code slice does not include the separately prepared UI, local server or browser harness. They exist only in the generated local prototype package pending a separate reviewed repository write. The production UI, Worker, D1, workflows, release manifests, source records, private financial data and alert settings are untouched.

## Verification and limitations

Local preparation: 30 Node tests passed, zero failed/skipped/cancelled; engine and unit-test syntax passed. Weight arithmetic uses six-decimal fixed point; fees/output use IEEE-754. This is not validated production NAV accounting, a calibrated model, an official price anchor or an executable switch price.

The separate prepared UI/server passed 8 loopback HTTP checks and 7 real Chromium UI cases through Python Playwright 1.51.0: catalogue/nowcast separation, arithmetic/input invalidation, scheme isolation, missing-return blocking, acknowledgement, JSON export and viewport/keyboard navigation. Initial synchronous Playwright execution failed in an async host and was corrected with the async API. Mobile WebKit could not launch because its executable was absent; its cases are not executed, not passed. The repository-pinned Node Playwright 1.64.1 suite remains unexecuted. No new CI, production/account regression suite or live feed probe ran. Do not substitute local Chromium checks for CI or WebKit evidence.

PR #6 checks were retrieved during preparation: verify, compare-one-feed and public-preflight failed; one browser job succeeded and one was cancelled; alert regressions succeeded and three publishers were skipped. Those existing results are not prototype tests or evidence of feed recovery. No checks were weakened. PR #6, production and project settings were not modified; no migration, notification, merge, deployment or activation occurred.

## Research and source boundaries

[Research](simplicity/research.md), [design](simplicity/design.md), [source inventory](../config/simplicity/sources.json), [documentation map](simplicity/documentation-map.md), [project-instructions draft](simplicity/project-instructions.md), [automation contract](automation-outcomes.md), [historical browser handover](simplicity-browser-status.md) and [historical release handover](simplicity-ui-release.md) remain separate records.

The nine-fund source inventory remains provisional and non-exhaustive. Later chat-only eight-fund research and Python prototype artifacts are not claimed as committed records. Keep KiwiSaver and Investment identities/price series distinct. Verify current official catalogue/register entries and index-linked document versions; preserve exact URLs, revisions, dates, hashes, retrieval evidence, passages, actual/target allocations, policy/observed hedging, exclusions, rounding and unknowns. AI extraction remains provisional until reviewed; readiness is fund-specific.

## Next steps

1. Approve and commit this exact engine/test slice, then verify its resulting commit. No branch-matched CI success is established.
2. Review and commit the prepared UI/server/browser harness separately. Execute the repository-pinned Chromium and mobile-WebKit suite, preserving failures rather than skipping checks for a green result.
3. Review against current main without incorporating PR #6 release work silently. Obtain separate approval for PR creation, merges, external writes, deployment and activation.
4. Persist and review source evidence before choosing dated fund allocations, hedging conventions, fees, market/FX proxies, unlisted assumptions and valuation cutoffs. Backtest without look-ahead bias before considering nowcasts. Scenarios remain separate.
5. Resolve release/feed failures independently. After provider recovery verify CSV continuity and Worker/D1 refresh, then actual release pins/results. Never replace a missing official price with this scenario.
