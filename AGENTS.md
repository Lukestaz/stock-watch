# Agent entry point

Read README.md for the existing application architecture. For the Simplicity feature, read docs/simplicity-status.md before making changes. Check the current branch and commit: a feature-branch handover is not a statement about production.

For current Simplicity release preparation, read docs/simplicity-preview-release.md and ci-results:simplicity-release/discovery/latest.json. Match source SHA/ref and run identifiers. A completed metadata inventory does not certify isolation. The observed scoped inventory found only production project resources; do not select them as preview targets or create alternatives without separate approval.

For automated outcomes, read docs/automation-outcomes.md. The existing ci-results branch is the reporting location. Read simplicity/latest.json on that branch and verify its source commit, run and timestamps; do not substitute latest-successful.json for a failed latest attempt. An absent or older record does not verify current code.

For browser evidence, read docs/simplicity-browser-status.md and ci-results:simplicity-browser/latest.json. Keep browser-job outcomes separate from unit/feed verification. Test implementation and syntax checks do not establish browser execution or a passing workflow. Historical checkpoint notes are not a current rollout inventory; use the current release handover and matching evidence.

## Outcome records

Update the relevant status document in the same commit as code/configuration changes. When asynchronous CI or discovery completes, follow up with the actual commit, run IDs, provenance, result, limitations and next gate. Keep PR descriptions consistent when updating them is separately authorised. Keep committed, tested, deployed and enabled states separate. Do not rely on chat history as the only handover, invent run IDs or claim an entire workflow passed from one step. Documentation-only recording of unchanged evidence does not require repeating provider probes.

## Boundaries

- Keep personal balances, transaction exports, positions, credentials and notification destinations out of this public repository and public assets.
- Preserve account isolation and existing stock-price behaviour. Run account/runtime regressions when their entry points change.
- Fund observation date, retrieval timestamp, cache TTL and publication freshness are separate concepts. A successful download does not independently verify fund identity.
- Do not create infrastructure, apply remote migrations, deploy, enable feature flags, activate alerts or send test notifications merely because code or tests were approved. Obtain action-specific approval for resolved targets.
- Never bypass D1 and its refresh coordination when fund persistence is unavailable.
