# Simplicity production status and fetch receiver fix

Updated 2026-11-08 NZDT. The latest observed deployed build is b8fd856a944f3332eaf5cf75261a1e157b24e661. Worker deployment, account/database health and the canonical fund page are verified, but fund refresh still returns 503. A receiver-safe fetch fix is prepared in this follow-up; live restoration is pending.

## Observed evidence

Initial release a06aeead71e807bdc2b9ae85be01bbfc7669f825 targeted 40986bd5e34c7e38bd349607446130699d9e8c25. Run 42469150264 verified the additive migration and completed deployment, then failed verification. Diagnostic run 42469696962 identified refresh-failed followed by backoff while build, account/database health, settings, flags and guards passed. No rollback occurred.

The deployed diagnostic hotfix b8fd856 produced run 42472490800, number 1, attempt 1, updated 2026-11-08T10:41:58.240Z. Connector-retrieved ci-results:simplicity-release/hotfix/latest.json reports deploymentVerified:true, secretBindingNamesPreserved:true, pageInitialStatus:307, pageCanonicalPath:/simplicity, pageVerified:true, fundHttpStatus:503, cacheReason:refresh-failed, refreshRestored:false and refreshFailure:{stage:download,category:download-or-runtime-failure}. No migration was requested. This confirms a download/runtime failure; it does not prove an upstream HTTP rejection, parser failure or storage fault.

The earlier HTML probe failed because redirects were refused; the hotfix now verifies the permitted canonical redirect. The actual page is https://stock-watch-app.lukestaz.workers.dev/simplicity (the .html path redirects there). No stock-dashboard navigation link was included.

## Candidate compatibility fix and regression

The fetch adapter previously defaulted fetchImpl to the bare global fetch function, then invoked that local reference. This follow-up defaults to (input, init) => globalThis.fetch(input, init), retaining the global receiver. Explicit injected fetch implementations, host/URL allowlisting, timeout, size limits, strict CSV/date/price checks, D1 coordination, backoff, alerts-disabled and identity-unverified status are unchanged. No fallback bypass or schema change is introduced.

A receiver-sensitive mocked-global regression failed with the old implementation and passed with the wrapper. A second test confirmed explicit injection still avoids global fetch. Local testing used a parser fixture; full real-import Simplicity/account/legacy regression suites must pass in GitHub before provider access. This is evidence of the receiver compatibility hazard, not proof that the production exception was specifically Illegal invocation. The live result remains the acceptance gate.

## Deployment and verification

The existing no-migration hotfix workflow now watches the fetch adapter and receiver test, and requires preflight build b8fd856. It targets only existing Worker stock-watch-app, Cloudflare account c4814713eafd41ae857b9a8097610df6, D1 stock-watch 4cb54afc-8f2d-4f62-8b6b-7d59f343b938. It retains approved bindings/current settings and secret binding names, requires friends flags off and no cron, deploys only the exact approved push commit, then checks new-build health, the canonical page, a validated fund response and cache reuse. No SQL/migration command, price-Worker deployment, new infrastructure, credentials change, alert activation or messages are included. Public fund GETs may refresh public cache/observations and consume feed/rate-limit capacity.

Read ci-results:simplicity-release/hotfix/latest.json and per-run records. Match sourceSha/releaseSha and run identifiers. deploymentVerified means new-build health, not restored price loading; refreshRestored and a passing outcome require validated live/cache reads. A continued 503 remains failed, with the bounded stage/category preserved. Retrieve and record the actual outcome after execution; do not rerun a successful migration for documentation.

Previous active version before b8fd856 was f1c46b38-1855-484a-8454-6f890b9d3244, deployment cd9464b5-35b5-4f9e-83ac-9b913edb9c7b, build 40986bd. Original pre-Simplicity version was 641f3384-c319-40c7-a862-a2a2aedfc1d9 for build e977e9e. These are historical recovery identifiers, not approval to roll back. The workflow captures the immediately preceding version and performs no automatic rollback or data deletion.
