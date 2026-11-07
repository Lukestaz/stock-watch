# Agent-readable automation outcomes

Implementation prepared on feat/simplicity-fund-monitor, 2026-11-08 NZDT. Publication has not yet been verified. Reuses the existing ci-results branch; does not create an automation-outcomes branch.

## Retrieval contract

Use the GitHub connector get_file_contents with owner Lukestaz, repo stock-watch and ref refs/heads/ci-results:

- simplicity/latest.json: newest recorded attempt for this workflow, ordered by run number and attempt.
- simplicity/latest.md: readable version of the same record.
- simplicity/latest-successful.json: most recent recorded passing verification job; not necessarily the latest attempt.
- simplicity/runs/<run-id>-<attempt>.json: per-run evidence, written once by this publisher.

Always check sourceSha, sourceRef, runId, runAttempt, recordedAt, jobResult and outcome. A record for another commit is not verification of current code. Do not infer success from a missing or older record. Check scope: these records describe verification checks, not the final overall workflow/publisher conclusion.

## Capture and publication

scripts/simplicity-outcomes.mjs captures the process exit status and structured TAP counts for Simplicity and account tests, UI syntax status, and bounded public feed metadata. Raw stdout/stderr stays in Actions logs and is not included in outcome files. Missing or inconsistent test totals cannot produce a passed outcome. All four checks plus a successful verification job are required.

The verification job has contents:read. A separate publisher has contents:write and actions:read only for trusted pushes to the exact repository and feature branch. It checks out the tested commit without persisted git credentials. Sanitised check artifacts and outcome/summary artifacts have 30-day retention. The publisher preserves existing result folders, uses non-force ref updates with conflict retries, and prevents an older run from replacing newer latest pointers. Existing run records are not overwritten.

Publishing changes only ci-results. The diagnostic trigger is restricted to the feature branch, so its own result commits do not retrigger it. No deployment, remote migration, personal portfolio data, provider secret or alert delivery is involved.

## Limitations and next verification

Hard cancellation, runner/setup failure or a publisher permission/API failure can leave no new record. The latest pointer is the latest recorded attempt, not a live run-status feed or a guarantee that no newer attempt exists. Compare the expected commit/run; absence means unknown. Artifacts can expire. Repository write permission is scoped to the publisher job but is not cryptographically restricted to the results branch; trusted source review remains necessary.

Reporter unit tests passed locally before committing. Full workflow execution, artifact transfer and real ci-results publication remain unverified until the first approved run finishes. After publication, read latest.json through the connector to verify provenance, counts and failure semantics. Browser and live D1 checks remain outstanding as described in docs/simplicity-status.md.
