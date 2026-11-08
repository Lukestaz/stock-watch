# Simplicity production status: confirmed redirect-mode root cause

Updated 2026-11-09 NZDT. Latest observed deployed build dd546efc89c6291ce9a182dfc821cd93d622378c has private exception logging enabled, but fund price loading is not restored. The original Worker runtime exception has now been supplied from Cloudflare logs. A specific redirect-mode correction is prepared; live success remains pending its approved deployment and acceptance checks.

## Confirmed failure

Owner-supplied Cloudflare event f17513ce-bfd7-444a-91b0-93a5c8dfa67a, timestamp 2026-11-08T19:40:08.089Z, is for stock-watch-app build dd546ef and public KiwiSaver High Growth, stage download. Exception: TypeError, Invalid redirect value, must be one of follow or manual; error is unsupported at the edge and manual response-status checking is required. The supplied stack identifies fetchImpl at account-runtime.js:156:110, fetchSimplicityHistory at :165:28 and loadDefault/handle. This event was supplied by the owner, not independently queried through a Worker-log connector.

The fetch helper passed redirect:error. That explains why Node/fixture-based download tests passed while this deployed Worker threw before obtaining a normal feed response. The previous receiver-wrapper change did not address this exception. The migration, page redirect and D1-save path were not the cause of this captured failure. Other unrelated runtime failures are not ruled out until the live corrected path succeeds.

## Correction and tests

Change only the upstream fetch redirect mode to manual. The existing !response.ok check rejects 3xx with Feed HTTP <status> before reading/parsing a body. No redirect target is followed; host/URL restrictions, timeout, size limits, strict CSV/date/price validation, D1 fencing/backoff and alert/identity limitations remain intact. The receiver-safe wrapper is retained. Existing test assertions are updated from error to manual rather than removing the redirect policy.

A Worker-shaped regression throws the exact invalid-mode error for the old option. It failed on the old implementation and passed after correction. Added tests verify refusal of 301, 302, 303, 307 and 308, one fetch call each and no Location follow. All 11 local fetch/receiver/redirect tests passed with actual parser logic and catalogue identities. These are not native Worker or live-provider tests; full repository regression suites run before the approved production deployment.

## Current production evidence

Run 42509345231, number 3/attempt 1, matches dd546ef and records deploymentVerified:true, privateLoggingConfigured:true, pageVerified:true after 307 redirect to /simplicity, fundHttpStatus:503, refreshRestored:false, exceptionCaptureReported:true and refreshErrorId:1261403d-2d3c-4a3e-a1b4-391706f783fb. That CI-triggered event and the later owner-supplied event have different IDs; do not conflate them. Historical failed runs 42472982650 and 42472490800 correspond to f6b12e0 and b8fd856. Initial run 42469150264 verified migration 0005_simplicity.sql and completed deployment. No automatic rollback occurred.

## Deployment and acceptance gate

The no-migration hotfix workflow requires current preflight build dd546ef and deploys only the exact approved push commit to existing stock-watch-app, account c4814713eafd41ae857b9a8097610df6. It retains D1 stock-watch (4cb54afc-8f2d-4f62-8b6b-7d59f343b938), current bindings/settings and secret binding names. Friends flags and cron remain off. Private custom exception logs remain enabled with automatic invocation logging disabled; do not copy original exception text into the public API or ci-results. No SQL/migration, price-Worker deployment, credential change, new infrastructure or notification action is included. Fund smoke GETs may populate public observations/cache and consume rate/feed capacity.

Read ci-results:simplicity-release/hotfix/latest.json and its per-run record after execution. Match sourceSha/releaseSha and run identifiers; require deploymentVerified:true, pageVerified:true, fundHttpStatus:200, secondFundHttpStatus:200, cacheReused:true, refreshRestored:true and outcome:passed before declaring restoration. Preserve and investigate any different captured error instead of masking it. Record the actual result in this document promptly; no rerun of the already verified migration is required.

The working page address is /simplicity; the .html path redirects there. Dashboard navigation is not included. Independent fund identity and publication-freshness policy remain unverified; alerts are disabled. Previous build/version metadata is retained in prior immutable run reports for separately approved recovery. No rollback or data deletion is automatic.
