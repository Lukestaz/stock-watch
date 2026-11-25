# Agent-readable automation outcomes

## Retrieval contract - 2026-11-25

Use GitHub get_file_contents for Lukestaz/stock-watch with ref refs/heads/ci-results. Always match source commit/ref, run ID/attempt, scope, timestamps, test-job conclusion and evidence provenance. Missing or older records never establish current success; do not substitute latest-successful for a failed latest attempt.

Existing verification paths remain simplicity/latest.json, simplicity/latest.md, simplicity/latest-successful.json and simplicity/runs/<run-id>-<attempt>.json. Existing browser records remain simplicity-browser/latest.json and its runs/ records. These historical pointers span their configured trusted branches; they are not live-health feeds.

## Scenario prototype records

Read simplicity-scenario/latest.json, simplicity-scenario/latest.md or simplicity-scenario/runs/<run-id>-<attempt>.json. The seed for 45531794511/1 was saved on ci-results at eef56470f62bd9065ee803fcdafe613637a0efb8 and read back through GitHub. Its original evidence remains user-supplied: 14 browser passes plus passing validation, not an independently established full job/workflow conclusion.

The scenario workflow adds a separate publisher only for push events in Lukestaz/stock-watch on feat/simplicity-scenario-prototype. Tests/PRs retain contents:read. Only the publisher receives contents:write/actions:read; it writes bounded JSON/Markdown under simplicity-scenario/ on ci-results. PR and fork events cannot publish. No pull_request_target trigger is used.

Published records distinguish jobResult, browserValidation, outcome and workflowConclusion=null. A successful test job and source-matched passing 14-case validator summary are both required for outcome=passed. Missing/unmatched evidence cannot pass; unknown counts remain null. Newer numeric run IDs/attempts advance latest regardless of success. Permanent run-attempt records are not overwritten. Existing trees, other folders and concurrent writers are preserved through non-force updates with bounded retries. Source/run identity conflicts fail closed.

Reports/traces remain synthetic Actions artifacts with seven-day retention. A publication proves a record was written, not the whole workflow finished successfully. Repository-write permission is job-scoped, not cryptographically restricted to ci-results; trusted-source review remains necessary. Runner/setup/cancellation/permission failures can prevent publication entirely. Check the expected commit before trusting latest.

No deployment, remote migration, private financial data, provider-secret changes or notification delivery is part of these jobs. Source extraction, live D1, pricing validity and activation remain separate gates.

## Preserved historical checkpoint

The complete prior automation contract, trust boundaries and verified b80f918 evidence are preserved at:
https://github.com/Lukestaz/stock-watch/blob/c9550fa478c9991a756460ada3b8174e2ce30162/docs/automation-outcomes.md
