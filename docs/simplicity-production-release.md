# Simplicity production status and private exception capture

Updated 2026-11-09 NZDT. Latest observed production build f6b12e008346ef6d45280d55af25a5b5c764ed77 deployed successfully, but fund refresh still returns 503. The receiver-safe fetch change did not restore loading. A logging-only patch is prepared; it is not yet deployed and does not claim to fix the underlying runtime exception.

## Current evidence

Run 42472982650, number 2/attempt 1, updated 2026-11-08T10:49:02.849Z, matches f6b12e0 and records deploymentVerified:true, secretBindingNamesPreserved:true, pageInitialStatus:307, pageCanonicalPath:/simplicity, pageVerified:true, fundHttpStatus:503, refreshRestored:false and failure stage download/category download-or-runtime-failure. No migration was requested and no automatic rollback occurred. Evidence is ci-results:simplicity-release/hotfix/latest.json and the corresponding per-run record.

Earlier run 42472490800 deployed diagnostic build b8fd856 with the same fund failure; initial run 42469150264 verified migration 0005_simplicity.sql and deployed 40986bd before failing smoke verification. Those are historical checkpoints, not evidence of current success. The page is /simplicity; .html redirects there. No dashboard navigation link exists.

## Logging patch

The refresh catch records the original exception before classification and before store.fail. A separate helper emits one JSON custom log with event simplicity-refresh-error, a fresh UUID errorId (not the lease owner), stage, public series ID, valid build SHA, original standard error name, bounded message (2,048 characters) and stack (8,192 characters). It reads only those fields, not arbitrary thrown-object properties or request objects. Common URL credentials/query strings, emails, auth/cookie headers and credential assignments are redacted. These safeguards do not make arbitrary exception text inherently safe; keep this data in private Cloudflare account logs.

Logging/getter/ID failures return null and cannot throw over the original failure. The API still returns only the allowlisted category plus the UUID if logging reported success. No original message/stack is returned through the API or committed to public ci-results. Existing host restrictions, validation, leases, backoff, stale handling and alert-disabled semantics remain unchanged. No schema change or migration is added.

The production hotfix workflow requires the current f6b12e0 build and full offline regression suites before provider access. It enables observability with 100-percent custom-log sampling, stored logs and invocation_logs:false, and refuses an existing external log destination. No new export destination is installed. This consumes the existing account's Workers Logs allowance and may incur plan-dependent usage; no exact billing claim is made. Automatic invocation metadata logging is disabled; only explicitly emitted custom logs are requested, not blanket request/cookie/body logging.

The release retains approved Worker/D1/service/rate-limit settings and secret binding names, leaves friends flags and cron off, deploys the exact approved source commit, then checks live health and logging configuration. It makes no SQL/migration/rollback calls. A public fund smoke GET can refresh public cache records; if backoff is active it waits once, at most 65 seconds, without resetting the database. The public report retains refreshErrorId and exceptionCaptureReported, never the private exception text. A successful capture signal does not independently prove backend log ingestion, and logging is not a price fix. The overall smoke outcome remains failed while refreshRestored is false.

## Inspection and next gate

After execution, read ci-results:simplicity-release/hotfix/latest.json for the exact source/run, privateLoggingConfigured and refreshErrorId. In Cloudflare Workers & Pages, select stock-watch-app, then Observability/Logs and search for simplicity-refresh-error or that UUID. Inspect the redacted name, message and stack from the new occurrence. Earlier discarded exceptions cannot be reconstructed from the JSON status. No direct Worker log-retrieval connector was available when this patch was prepared; do not claim the original exception has been inspected until an actual event is retrieved.

Five local logging/redaction/failure-safety tests passed. Full real-import Simplicity/account/legacy suites still must pass in the approved workflow. Record the actual deployment/capture result promptly in this document. Once the root cause is fixed, review reducing/removing temporary logging; no automatic cleanup is scheduled by this patch.

## Targets and boundaries

Existing stock-watch-app, Cloudflare account c4814713eafd41ae857b9a8097610df6, existing D1 stock-watch 4cb54afc-8f2d-4f62-8b6b-7d59f343b938. No new infrastructure, price-Worker deployment, migrations, credentials changes, notification sends, alert enrolment or cron activation. Recovery identifiers remain in immutable prior run records; restoring a version or deleting tables requires separate approval. The owner chose direct production for this app, not exemption from these action-specific boundaries.
