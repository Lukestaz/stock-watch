# Simplicity direct-production release

Updated 2026-11-08 NZDT: migration verified; deployment command completed; post-deployment verification failed. This is not a fully verified successful release. No automatic rollback occurred. Verification-only diagnostics are prepared in this follow-up and have not yet run.

## Observed production outcome

Source tooling commit a06aeead71e807bdc2b9ae85be01bbfc7669f825 targeted application 40986bd5e34c7e38bd349607446130699d9e8c25. Run 42469150264, number 1, attempt 1, published at 2026-11-08T09:55:13.216Z (22:55:13 NZDT). Run URL: https://github.com/Lukestaz/stock-watch/actions/runs/42469150264. Evidence was retrieved from ci-results:simplicity-release/production/latest.json, matching the owner-supplied record.

The report records migrationAttempted:true, migrationVerified:true, deploymentAttempted:true, deploymentVerified:false, stage/failedStage:verify, outcome:failed and automaticRollbackPerformed:false. The code reaches verify only after the deployment CLI returns success. Production may therefore be serving the new version; do not assume the old version remains active or that no changes occurred. One or more verification assertions failed, but the original reporter did not retain the individual failing check. The root cause remains unknown.

Recorded previous build: e977e9e0dcb44708fa9cdf1199ce69a8ea6e02a6. Previous deployment: 24c14499-7f8a-4391-a978-8195489b0e35. Previous Worker version: 641f3384-c319-40c7-a862-a2a2aedfc1d9. These are recovery identifiers, not a recovery action or proof of the current active version. No rollback or table deletion is authorised by diagnostics.

## UI status

The owner reports seeing the app but no Simplicity dashboard change. That is consistent with the release scope: the deployed source includes a standalone /simplicity.html page and no stock-dashboard navigation link. Intended URL: https://stock-watch-app.lukestaz.workers.dev/simplicity.html. A direct web-tool fetch failed, so it is not independent evidence that this page currently works. Diagnose page availability, markup and API separately before adding navigation or declaring success.

## Diagnostic follow-up

.github/workflows/simplicity-production-diagnostics.yml runs only on its own matching release-branch push. It does not modify the deployment workflow, migration or production script, so committing this follow-up does not retrigger migration/deployment. It imports only the existing pure configuration and view validators; module entry guards prevent the release runner executing.

Each check is recorded separately: health HTTP/build/account/database; settings HTTP and original configuration-verifier compatibility; read-only/build/alert flags; each static asset and fund-page markup; first fund response/payload; cache reuse; origin/anonymous-account guards; disabled alert routes. Checks continue after a failure. Root HTML navigation-link detection is informational, not a failure condition. Reports include status codes and allowlisted cache/error categories, never raw response bodies, credential values, private rows or arbitrary provider errors.

The existing Cloudflare token is used only for a GET of stock-watch-app settings. All app probes are GETs to fixed routes, with redirect refusal, 25-second timeouts and 2 MB response bounds. No SQL command, migration, redeploy, rollback, configuration change, cron change or message is performed. Fund GETs can refresh public observations/cache and consume public-feed/rate-limit capacity; anonymous account GETs can increment admission counters. This is verification-only, not a claim of literally zero storage side effects.

Original predeployment secret-binding names were not included in the release report, so diagnostics cannot reconstruct that comparison. Only the current count is reported, with originalSecretBaselineCompared:false. Even if all new probes pass, that is current diagnostic evidence, not proof of every original assertion or end-to-end signed-in account behaviour.

Read ci-results:simplicity-release/diagnostics/latest.json and its per-run records. Match sourceSha, run identifiers and expectedRelease. The original release report remains unchanged under simplicity-release/production. Diagnose is contents:read; only a separate trusted-push publisher has repository write permission. Diagnostic artifacts have seven-day retention. Actual diagnostic results must be recorded after execution; do not rerun a successful migration merely to update docs.

## Fixed production scope and safeguards

Account c4814713eafd41ae857b9a8097610df6; existing Worker stock-watch-app; D1 stock-watch, 4cb54afc-8f2d-4f62-8b6b-7d59f343b938. Only 0005_simplicity.sql was exposed to the migration command; its public tables/schema and ledger addition were verified by the release runner. No blanket migration replay or intentional account-table alteration was included. Application code and assets were pinned to 40986bd; the stock price Worker was not deployed.

The approved release intended SIMPLICITY_READ_ONLY=true, retained existing public settings, D1/service/rate-limit bindings and secret bindings, and kept friends flags/cron off. Those final live conditions are not all certified because verification failed. Identity/freshness warnings and alerts-disabled status remain the intended scope. No all-fund identity policy, publication schedule, notification activation or new infrastructure is part of this release.

Five local configuration tests and four SQLite/schema cases passed during preparation; they are not production-success evidence. The owner explicitly waived isolated preview creation for this play app. That waiver does not authorise blindly rerunning migrations, overwriting configuration or enabling multi-user alerts.
