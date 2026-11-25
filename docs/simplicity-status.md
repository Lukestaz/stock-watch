# Simplicity feature handover

## Directly retrievable scenario results - 2026-11-25 NZDT

Authoritative checkpoint, not production-health evidence. Prototype source inspected at c9550fa478c9991a756460ada3b8174e2ce30162. Prior implementation and verification history:
https://github.com/Lukestaz/stock-watch/blob/c9550fa478c9991a756460ada3b8174e2ce30162/docs/simplicity-status.md

## Saved evidence

Run 45531794511, attempt 1, for source c9550fa has user-supplied Playwright 1.64.1 evidence: 7 Chromium and 7 mobile-WebKit cases passed, zero failed/skipped/flaky, with matching report-validator outcome=passed. This resolves the earlier browser setup blockers for that run only. Full test-job/workflow and artifact-upload conclusions remain unknown.

The supplied evidence is preserved on ci-results at eef56470f62bd9065ee803fcdafe613637a0efb8 under simplicity-scenario/runs/45531794511-1.json plus latest.json/latest.md. latest.json was read back through GitHub successfully. Repository retrieval does not change the original evidence provenance to independently retrieved Actions evidence.

## Automatic publisher batch

The scenario test workflow gains a separate publisher restricted to trusted pushes in Lukestaz/stock-watch on feat/simplicity-scenario-prototype. Test and PR jobs remain read-only. The publisher has contents:write/actions:read and targets only simplicity-scenario/ on ci-results. Credential persistence is disabled. It saves per-run/attempt JSON and newest-attempt JSON/Markdown, including failures. Run records are not overwritten; existing trees/folders are preserved; ref updates are non-force with conflict retries. Newer numeric run/attempt identifiers advance latest regardless of pass/fail. Result commits do not match workflow branch triggers.

The result separates test-job conclusion, browser validation and unknown whole-workflow conclusion. Passing browser evidence cannot hide a later test-job failure. Missing or mismatched summaries never pass; unknown counts remain null. Screenshots/traces stay synthetic Actions artifacts for seven days, not public result files. Artifact-download failure is tolerated only in the publisher so a missing-evidence failure record can be saved; test gates are unchanged. Infrastructure/cancellation/permission failures can still prevent publication, so absence or an older pointer is not success. Write permission is job-scoped rather than cryptographically limited to the results branch.

Local publisher verification: 16 mocked-API Node tests passed, covering provenance, failed/cancelled jobs, missing summaries, ordering, older-run protection, newer-failure replacement, valid JSON, existing trees, non-force updates, conflict retries, immutable records and PR rejection. Syntax/YAML policy checks passed. This is not live publication or new browser/CI success. The approved workflow commit triggers a new test run (20-minute bound) and publisher (5-minute bound); verify the resulting commit and directly retrieved new record before claiming automatic publication is working.

## Boundaries and next steps

[Automation retrieval contract](automation-outcomes.md), [prototype instructions](../prototypes/simplicity-scenario/README.md), [research](simplicity/research.md), [design](simplicity/design.md) and [source inventory](../config/simplicity/sources.json) remain distinct. All real-fund scenario assumptions remain manual. No numerical nowcast, accuracy claim, executable switch price, source-parameter approval, official-price substitution, production change, merge, migration, notification or alert activation is included. PR #6 and its historical failing/cancelled checks remain separate.

After approved activation, retrieve ci-results:simplicity-scenario/latest.json, match its source SHA/ref and run/attempt to the new commit, inspect jobResult/browserValidation/outcome, and preserve failures. Confirm PR publishers remain blocked. Update this checkpoint with actual activation evidence. Current-main integration, release readiness and fund-specific reviewed allocations/hedging/fees/proxies/cutoffs/backtesting remain separate work requiring their applicable approvals.
