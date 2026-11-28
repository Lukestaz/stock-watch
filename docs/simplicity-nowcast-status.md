# Simplicity publication context and nowcast checkpoint

Prepared 24 November 2026 NZDT on feat/simplicity-freshness-nowcast, from main at dfdc90f9449bd31f7ae6d26d8698960bad7f273e.

## Scope of this patch

- Add a read-only context panel below the published-price card.
- Explain Simplicity's two-working-day publication delay without asserting an exact update time, holiday policy, or an independently verified latest observation.
- Distinguish D1-cached responses, failed-refresh fallback and publication status. Preserve raw freshness metadata in Data details.
- Show estimated unpublished prices as unavailable. No model, numerical estimate, dotted-line series, proxy feed, personal position or switch instruction is implemented by this patch.
- Preserve existing published prices, history, range controls, date formatting and source identity warnings. The panel has no additional focusable controls ahead of the chart.

Provider explanation: https://help.simplicity.kiwi/portal/en/kb/articles/how-does-unit-pricing-work

## Verification provenance

The proposed files were tested in a temporary local sandbox with Node v20.20.2. Syntax checks passed for site/simplicity.js and site/simplicity-view.mjs. Nine new context tests and four existing date-display tests passed: 13 passed, zero failed/skipped/cancelled. The new rendering test uses a minimal DOM stub, not a browser or accessibility audit.

The copied original JS and view files were checked against their Git blob SHAs: d9f25cb82bd1c60d56b502e2a839d0adb8b9f613 and 1908a4ca9f83612933888f6975d61af68f7fff8b. The existing date test matched ab6d9200a00c4c7cd5d19e3eacc446cc5575b060.

Full account/runtime regressions, full Simplicity tests, Node 22 CI, browser execution, live feeds and live deployment checks have not been run for this patch. The existing diagnostics workflow does not run on pushes to this new branch; an approved PR to main can trigger read-only PR verification. Do not describe these local checks as a passing workflow or production verification.

## Release state and boundaries

The separately retrieved ci-results:simplicity-release/ui/latest.json still records release run 44380110277 attempt 1 as failed at verification: deploymentAttempted true, deploymentVerified false, automaticRollbackPerformed false, migrationRequested false, alertsActivated false. Its source is 95d31b2e7b640b66dceaee0f78f3086f06274122, frontend 51e99d3bc598e99a42e74190cb845724b25cca90 and runtime 51f4f4400f008a0aa2d913febbfe0ae1a067b654. This is a historical reporting record, not a fresh live health check.

No merge, production deployment, migration, feature activation, notification or alert enrollment is part of this patch. Deployment must use separately approved resolved targets and content. Check main and the release workflow's pinned frontend/runtime pair before proposing a release; merging this UI alone does not update that pair.

## Next work

1. Review and commit this patch, then obtain separate PR approval and verify results for the actual commit.
2. Run desktop/mobile browser tests and account/runtime regressions before release approval.
3. Resolve live production verification separately.
4. Before numerical nowcasts: identify fund/scheme-specific dated allocations, hedging and reliable proxy sources; align valuation cutoffs; model unlisted components explicitly; backtest out of sample.
5. Only then implement opt-in dotted estimates, explicit as-of timestamps, calibrated error reporting and a separately approved relative-switch comparison. Never mix estimates into official history or activate alerts from them.
