# Agent-readable automation outcomes

Updated 2026-11-08 NZDT for PR #5. Publication has been verified for application checkpoint b80f918f2e34b8b064802654b87d0f8536d9bee5. The subsequent PR/main CI configuration in this follow-up still requires a fresh run; earlier results do not verify a newer commit.

## Retrieval contract

Use get_file_contents for Lukestaz/stock-watch with ref refs/heads/ci-results.

- simplicity/latest.json and latest.md: newest recorded verification attempt and readable summary.
- simplicity/latest-successful.json: most recent recorded passing verification attempt, not necessarily the latest attempt.
- simplicity/runs/<run-id>-<attempt>.json: per-run verification evidence.
- simplicity-browser/latest.json, latest-successful.json and runs/<run-id>-<attempt>.json: separate browser-job evidence.

Check sourceSha/sourceRef or testedCommit/sourceBranch, runId, runAttempt, timestamps, jobResult, outcome and report availability. Latest pointers span trusted pushes to main and feat/simplicity-fund-monitor; they are not branch-specific or live-status feeds. Always match the expected branch and commit. Missing, old or last-successful records do not establish current success.

## Verified checkpoint

The connector retrieved both published results for b80f918. Verification run 42421256771 (number 10, attempt 1) passed 65 Simplicity and 95 account/runtime tests, UI syntax and ten complete public-feed checks. Browser run 42421257083 (number 2, attempt 1) passed 24 cases, 12 per browser, with no failures, flaky or skipped cases.

After PR #5 was opened, GitHub's check-runs API independently confirmed success for both original verification/browser jobs and both publishers. PR adapter, schema, alert-regressions and dashboard browser jobs also reported success for that head; the dashboard PR publisher was skipped as intended. These are job conclusions, not a claim about every possible overall workflow or future commit.

## Execution and trust boundaries

The follow-up configures both Simplicity-specific workflows for matching pull requests targeting main and matching pushes to main or the feature branch. Push/PR path filters match within each workflow. PR test jobs inherit contents:read; no pull_request_target trigger is used. Only a separate publisher has contents:write and actions:read, guarded to push events in the exact repository and one of those two branch refs. PR events and fork pushes cannot pass that guard.

The verification job captures process exit status separately from TAP counts. Missing or inconsistent totals cannot produce a passed record. All four checks and a successful verification job are required. Browser records retain per-project counts and bounded failure details. Raw verification stdout/stderr is not committed; browser screenshots/traces contain synthetic test data only. Artifacts have 30-day retention.

Publishers preserve other result folders, use non-force ref updates with conflict retries, retain write-once run records and prevent older attempts replacing newer latest pointers. Their commits target ci-results, which does not match the workflow branch triggers. Main publication remains pending until a qualifying main push after merge; no merge is authorised by this documentation.

## Limitations

Cancellation, setup/runner failure or publisher permission/API failure can leave no new record. Publication proves that save step ran, not that a later step or the overall workflow finished successfully. Repository write permission is job-scoped, not cryptographically limited to the results branch; trusted source review remains necessary.

No deployment, remote migration, private portfolio data, provider-secret change or alert delivery is part of these reporting jobs. Live D1, rollout bindings, independent fund identity and publication-freshness policy remain separate gates.
