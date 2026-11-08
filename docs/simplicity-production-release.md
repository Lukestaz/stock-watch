# Simplicity direct-production release

Prepared 2026-11-08 NZDT following the owner's explicit decision to skip preview infrastructure for this play app. Migration/deployment results are pending until the approved workflow runs. Do not describe this preparation as a completed deployment.

## Exact scope

Cloudflare account c4814713eafd41ae857b9a8097610df6; existing Worker stock-watch-app at https://stock-watch-app.lukestaz.workers.dev; existing D1 stock-watch, ID 4cb54afc-8f2d-4f62-8b6b-7d59f343b938. Application source is pinned to merged, CI-verified 40986bd5e34c7e38bd349607446130699d9e8c25. Release tooling comes from this separately reviewed branch commit. No new infrastructure or preview is created. The existing production price Worker is neither deployed nor migrated.

The approved push runs the dedicated production workflow on feat/simplicity-preview-release. It runs offline guard tests and the pinned application's Simplicity/account/legacy tests before accessing the Cloudflare credential. Tests have contents:read. The writer is a separate trusted-push reporting job. Deployment shares the existing deploy-stock-watch-app concurrency group.

## Preflight and changes

The runner requires healthy account/database status, disabled friends alerts, no registered app cron, one 100-percent prior deployment version and expected live D1/service/rate-limit bindings. It retains prior build, deployment and version IDs for a separately approved recovery. Unknown bindings, active alert configuration or incompatible existing Simplicity tables stop the release.

Existing plaintext Worker settings are retained in a private temporary configuration, never logged or published. Secret values are not fetched; secret binding names are compared before and after deployment. The existing Google client configuration is read from current settings, not guessed. Deployment enables SIMPLICITY_READ_ONLY=true and sets BUILD_SHA to the pinned release; friends alert/enrolment/schedule flags remain false and cron remains empty.

Only 0005_simplicity.sql is copied into a dedicated temporary migration directory. Wrangler 4.150.0 applies that directory against the exact existing D1 binding and maintains d1_migrations. No blanket migration replay, drops, account-table edits or private application-row queries are included. Existing migration names must remain unchanged, with only that filename added if not previously applied. Schema guards check both public tables, column types/keys, the positive-price constraint and foreign key. Wrangler's migration backup/rollback behaviour is not a claim that a restore was tested.

After migration, Wrangler deploys the pinned source and static assets to stock-watch-app, retaining the production PRICES service and rate limiter. The market-data asset URL is adapted to same-origin /api as in the existing deployment process. No dashboard navigation edit is included; the fund page is /simplicity.html.

## Verification and records

Postchecks require the expected build, account/database health, preserved secret binding names, enabled read-only fund flag, static assets, one real KiwiSaver High Growth API response followed by cache reuse, cross-origin rejection, anonymous account rejection and unavailable alert routes. Live fund GETs intentionally populate public observation/fetch-state records and may consume public-feed/rate-limit capacity. Prices retain identity-unverified and alerts-disabled status. These smoke checks do not prove a new publication policy, all fund identities or every production failure path.

Read ci-results:simplicity-release/production/latest.json and runs/<run-id>-<attempt>.json under that production directory. Match sourceSha, releaseSha and run identifiers. Migration/deployment attempted and verified fields are separate, so a failed migration/deploy/postcheck cannot be reported as no changes. Redacted artifacts have 30-day retention. Provider stdout/errors, private rows, plaintext settings and credential values are not published.

There is no automatic rollback or table deletion. If deployment or verification fails, inspect the stage and prior-version metadata before approving recovery; an additive migration can remain applied after a failed deployment. Missing reports or running states do not establish success.

## Current verification and documentation

Five configuration-guard unit tests and four local SQLite/schema-guard cases passed during preparation. These are not live production evidence. After execution, retrieve the actual outcome and update this document and the current feature handover promptly without rerunning a successful migration just to update docs. The existing manual deploy-app.yml still pins the older release and is not invoked by this workflow.

No multi-user alert activation, emails, provider credential changes, cron activation, private-data migration or extra resource creation is authorised by this release. The owner's production choice supersedes the earlier isolated-preview requirement for this Simplicity rollout only; all other action-specific boundaries remain.
