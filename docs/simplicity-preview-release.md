# Simplicity isolated-preview release preparation

Updated 2026-11-08 NZDT after connector retrieval of the published discovery report. Branch: feat/simplicity-preview-release, created from merged main at 40986bd5e34c7e38bd349607446130699d9e8c25. Discovery implementation checkpoint: 532dee8113579d6036a0c7cedec8762d70403432. No preview target has been selected, created or certified isolated.

## Current outcome

The bounded, project-name-filtered Cloudflare metadata read completed and its report was published. It found only the known production database and two production-bound Workers within its scope. No isolated preview candidate was identified. This does not establish that no differently named resource exists anywhere in the account.

Evidence: ci-results:simplicity-release/discovery/latest.json, retrieved through the GitHub connector. Run 42468392125, number 1, attempt 1, source ref refs/heads/feat/simplicity-preview-release, source SHA 532dee8113579d6036a0c7cedec8762d70403432. checkedAt: 2026-11-08T09:43:40.714Z (2026-11-08 22:43:40 NZDT). Run URL: https://github.com/Lukestaz/stock-watch/actions/runs/42468392125.

The report records complete:true, issues:[], isolationVerified:false, sqlExecuted:false and mutationsRequested:false. These establish the discovery script's recorded outcome and successful report publication, not an independently retrieved final overall workflow conclusion or permission to deploy. Five synthetic discovery tests passed locally before the implementation commit; no new claim about individual CI test output is inferred from the metadata report.

## Discovered project resources

- D1 stock-watch: 4cb54afc-8f2d-4f62-8b6b-7d59f343b938, classified known-production-do-not-use-for-preview.
- Worker stock-watch-app: settingsRead:true; binding DB points to that production D1 ID; service binding PRICES points to stock-watch-prices. Classified known-production-or-production-bound-do-not-use-for-preview.
- Worker stock-watch-prices: settingsRead:true; binding DB points to the same production D1 ID; no service bindings reported. Same do-not-use-for-preview classification.

Do not use either Worker or this database as the isolated preview merely because the feature is read-only: ingestion and refresh coordination write public observations and fetch-state records. No preview infrastructure creation, migration, deployment, flag change or notification action has been performed by this discovery.

## Discovery contract

The dedicated workflow runs only on matching pushes to this exact branch in Lukestaz/stock-watch. Five synthetic tests run before the API-token step. Inspection has contents:read; a separate trusted publisher has job-scoped write permission and its code writes the filtered report to ci-results. No PR or pull_request_target trigger is present.

The existing GitHub secret CLOUDFLARE_API_TOKEN is used server-side for Cloudflare account c4814713eafd41ae857b9a8097610df6. Only GET metadata endpoints are called: D1 database lists, Worker script lists and project Worker settings. No SQL, Worker code downloads, secret-list/value endpoints, provider-mail requests, application probes or Cloudflare mutations are performed. Redirects are refused. Responses are capped at 2 MB, requests at 15 seconds, D1 listing at five 100-item pages and project settings at 20 Workers. Failures and limits produce incomplete evidence, not an empty successful inventory.

Only stock-watch/simplicity-prefixed names, D1 IDs and D1/service binding references are published. Unrelated records, plaintext/secret binding values, private rows and raw provider errors are filtered out. Settings responses are filtered in memory; API metadata must not be assumed inherently free of sensitive values.

## Reading and maintaining evidence

Read ci-results:simplicity-release/discovery/latest.json or simplicity-release/discovery/runs/<run-id>-<attempt>.json. Match source SHA/ref and run identifiers. Artifacts have one-day retention; committed filtered reports persist in repository history. complete means the bounded scoped read completed, not that any candidate is safe. Every report sets isolationVerified:false. Resource ownership, non-project Worker dependencies and data contents have not been comprehensively audited.

This follow-up changes documentation only. Its newer commit does not require another inventory run: the evidence remains explicitly attached to 532dee8. The workflow path filters do not include these Markdown files. New discovery code or configuration requires its own verification.

## Next gates

1. Propose an exact new non-production Worker and D1 database, or inspect a specifically identified existing candidate. No automatic selection or production fallback is permitted.
2. Review ownership, binding isolation, resource names and expected cost before separate creation approval. Absence of a discovered preview does not authorise creating one.
3. Prepare a pinned, default-off preview configuration; obtain separate approvals for remote migration 0005, deployment and any feature enablement.
4. Verify actual D1 compatibility, cold/warm reads, leases, stale/failure handling, disabled gates and browser behaviour before proposing production.

Multi-user alerts stay separate. No messages, credentials changes or cron activation belong to this discovery/docs batch.
