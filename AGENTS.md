# Agent entry point

Read README.md for the existing application architecture. For the Simplicity feature, read docs/simplicity-status.md before making changes. Check the current branch and commit: a feature-branch handover is not a statement about production.

For automated outcomes, read docs/automation-outcomes.md. The existing ci-results branch is the reporting location. Read simplicity/latest.json on that branch and verify its source commit, run and timestamps; do not substitute latest-successful.json for a failed latest attempt. Publication remains unverified until a record is actually retrieved.

## Outcome records

At meaningful checkpoints, update the relevant status document with what changed, verification evidence and its provenance, known limitations, pending migrations/deployments, and concrete next steps. Keep committed, tested, deployed and enabled states separate. Do not rely on chat history as the only handover. Never invent CI run IDs or claim an entire workflow passed from one step's output.

## Boundaries

- Keep personal balances, transaction exports, positions, credentials and notification destinations out of this public repository and public assets.
- Preserve account isolation and existing stock-price behaviour. Run account/runtime regressions when their entry points change.
- Fund observation date, retrieval timestamp, cache TTL and publication freshness are separate concepts. A successful download does not independently verify fund identity.
- Do not apply remote migrations, deploy, enable feature flags, activate alerts or send test notifications merely because code or tests were approved. Obtain the action-specific approval required by the execution environment.
- Never bypass D1 and its refresh coordination when fund persistence is unavailable.
