# One-fund HTTP comparison checkpoint

Prepared 24 November 2026 NZDT for PR #6 / feat/simplicity-freshness-nowcast, following diagnostic revision 51d9bee1a59d02ecb655f2bcffca5ba60ae588c0.

The supplied log shows nine HTTP 404 HTML responses with matching first-1024-byte hashes and one Investment Balanced timeout. Matching prefixes do not establish identical full bodies or prove filtering. No production health conclusion follows.

This diagnostic-only workflow is restricted to PR #6. On one runner it makes three sequential Investment HG probes: existing Node Accept, Node default Accept, and curl with the existing Accept. Probes are separated by one second. It reuses the existing strict downloader/parser and bounded HTTP evidence helper. curl has a 10-second limit, 2 MB size limit, no redirects/retries/browser impersonation, and its temporary raw response files are removed. Only bounded public metadata is printed and uploaded. Any failed probe fails the comparison; existing verification gates are unchanged.

Limitations: curl retains different user-agent and transport defaults, so its outcome cannot isolate a single transport property. Sequential timing is another confounder. Results are investigative, not an approved alternate production downloader. The report records CI source SHA, PR head SHA, run/attempt and timestamp.

Six offline harness tests passed locally under Node v20.20.2, and script/test syntax checks passed. Workflow YAML structure was parsed locally. Tests use mock transports; live GitHub results and the complete regression suite for the new commit are pending.

No worker/UI/database/alert/release configuration changes, merge or deployment. Commit approval is required. After commit inspect this workflow's JSON artifact for the actual head revision; do not treat an old run or a successful comparison as production verification. Reassess removal of this temporary workflow before final release.
