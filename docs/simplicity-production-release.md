# Simplicity production status and refresh hotfix

Updated 2026-11-08 NZDT. The deployed 40986bd5e34c7e38bd349607446130699d9e8c25 build is healthy for accounts and has Simplicity enabled, but live fund refresh returns 503. Price loading is not operational. A targeted diagnostic hotfix is prepared; it is not yet deployed and is not a proven repair of the underlying refresh failure.

## Evidence

Initial release tooling a06aeead71e807bdc2b9ae85be01bbfc7669f825, run 42469150264, number 1/attempt 1, verified migration 0005_simplicity.sql and completed the deployment command, then failed at verify. No automatic rollback occurred. Existing production is Worker stock-watch-app, account c4814713eafd41ae857b9a8097610df6, D1 stock-watch 4cb54afc-8f2d-4f62-8b6b-7d59f343b938.

Diagnostic tooling eab5c0dadab3bf9de31805b9088ccc5efa26fe7a produced run 42469696962, number 1/attempt 1, checked 2026-11-08T10:02:29.655Z. Published evidence at ci-results:simplicity-release/diagnostics/latest.json confirms the expected 40986bd build, health/account/database, configuration compatibility, read-only flag, friends flags off, JS assets and access guards passed. First fund GET failed with refresh-failed/unavailable; the second reported backoff. No valid history/cache reuse was obtained. The /simplicity.html probe errored; the owner can render the standalone UI, so that probe error does not establish a missing page. Canonical redirect handling is a possibility, not yet proven. No dashboard link was detected; none was included in the release.

## Targeted diagnostic hotfix

The route retains D1 coordination, leases, fencing, backoff, validation, stale handling and feature gates. On an immediate refresh failure only, cache.failure adds an allowlisted stage (download, validate or persist), category and optional upstream HTTP status. It never returns raw error messages, SQL, credentials, recipients or provider bodies. Backoff responses do not invent a stored failure category. No migration or schema change is required.

The hotfix does not guess at a fetch/storage repair or bypass failure controls. Its purpose is to identify the actual failing runtime operation in the deployed Worker. If the feed still fails after deployment, the workflow reports failure plus the bounded category rather than calling instrumentation a successful price fix.

The dedicated workflow tests all Simplicity/account/legacy suites before provider access. It requires the currently healthy 40986bd build, expected bindings, existing read-only enablement, friends flags off and no app cron. It uses the existing checked production configuration, retains secret binding names and deploys only source from the exact approved GitHub push commit, using that SHA as BUILD_SHA. It never invokes the old migration/deployment workflow or any SQL/migration command. The price Worker is not deployed. Public fund probes can refresh observations/cache and consume public-feed/rate-limit capacity.

The page check uses manual redirect inspection and follows at most one same-origin canonical /simplicity or /simplicity/ redirect with no query/hash. This improves the probe without assuming a redirect was the original failure. Smoke checks record page verification, live fund status, allowlisted failure details or successful validated cache reuse. deploymentVerified records new-build account/database health; refreshRestored is a separate requirement for a passing outcome. Neither implies all fund identities, publication policy or signed-in browser behaviour are verified.

## Results and recovery

Read ci-results:simplicity-release/hotfix/latest.json and its per-run records. Match sourceSha/releaseSha and run identifiers. The original production and diagnostic reports remain historical, unchanged evidence. Record the actual hotfix result in this document after the approved run. Four local classifier/redaction tests passed using stubbed module dependencies, and workflow/embedded JavaScript syntax parsed; these are not live Worker or D1 tests. Full real-import regression execution is required in GitHub before deployment.

The hotfix report captures the previous build/deployment/version and partial-deployment state. No automatic rollback or data deletion occurs. Original pre-Simplicity recovery identifiers remain deployment 24c14499-7f8a-4391-a978-8195489b0e35 and version 641f3384-c319-40c7-a862-a2a2aedfc1d9 for build e977e9e0dcb44708fa9cdf1199ce69a8ea6e02a6; they are not proof of current active version or approval to restore it.

The owner chose direct production instead of isolated preview infrastructure. This hotfix approval is restricted to the existing app, safe error classification, the verifier and reporting. No new resources, migration replay, credentials changes, multi-user alert enrolment, cron activation or notification delivery are included. The standalone page remains /simplicity.html; dashboard navigation is separate.
