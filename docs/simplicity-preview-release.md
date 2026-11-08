# Simplicity isolated-preview release preparation

Branch: feat/simplicity-preview-release, created from merged main at 40986bd5e34c7e38bd349607446130699d9e8c25. This batch adds read-only discovery, not a deployment. No preview resource has yet been selected or certified isolated.

## Discovery contract

The dedicated workflow runs only on matching pushes to this exact branch in Lukestaz/stock-watch. Five synthetic tests run before the API-token step. The inspection job has contents:read; a separate trusted publisher can write only the filtered report through its code path to the existing ci-results branch. No PR or pull_request_target trigger is present.

The existing GitHub secret CLOUDFLARE_API_TOKEN is used server-side for GET requests to Cloudflare account c4814713eafd41ae857b9a8097610df6. Endpoints are D1 database metadata lists, the Worker script list and settings for project-named Workers. There are no SQL queries, Worker code downloads, secret-list/value requests, provider-mail requests, application HTTP probes or Cloudflare mutations. Redirects are refused. Responses are bounded to 2 MB and requests to 15 seconds; database discovery is capped at five 100-item pages and project Worker settings at 20 Workers. Permission failures or limits produce incomplete evidence, not an empty successful inventory.

Only stock-watch/simplicity-prefixed resource names, D1 IDs and D1/service binding references are published. Unrelated resource records, plaintext binding values, secret binding values, private rows and raw provider errors are not logged or published. The API settings response is filtered in memory; do not treat API metadata as inherently free of sensitive values.

## Reading results

Read ci-results:simplicity-release/discovery/latest.json or runs/<run-id>-<attempt>.json beneath that discovery directory. Match sourceSha/sourceRef and run identifiers. The GitHub artifact is retained for one day; committed filtered reports persist in repository history. The known production DB is 4cb54afc-8f2d-4f62-8b6b-7d59f343b938. Known production Workers and bindings to that DB are marked do-not-use-for-preview.

complete means the bounded scoped metadata read completed, never that a preview is safe. Every report sets isolationVerified:false. Candidate names do not prove isolation; non-project Workers, service dependencies, resource ownership and data contents have not been comprehensively audited. Missing candidates do not authorise creating resources or reusing production. No automatic target selection occurs.

## Next gates

Review actual discovery evidence. Resolve an exact genuinely non-production Worker and DB target; if none exists, propose explicit names, ownership, cost and creation actions for separate approval. Then prepare a pinned, default-off preview configuration and obtain separate approval for remote migration 0005, deployment and any feature enablement. Verify actual D1 compatibility, cold/warm reads, leases, stale/failure handling, disabled gates and browser behaviour before proposing production. Multi-user alert work stays separate; no messages or cron activation belong to this batch.

Five discovery unit tests passed locally. No real Cloudflare inventory run, new infrastructure, SQL execution, migration or deployment is claimed before the approved workflow executes.
