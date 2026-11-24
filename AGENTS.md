# Agent entry point

Read README.md for the existing application architecture. For the Simplicity feature, read docs/simplicity-status.md before making changes. Check the current branch and commit: a feature-branch handover is not a statement about production.

For automated outcomes, read docs/automation-outcomes.md. The existing ci-results branch is the reporting location. Read simplicity/latest.json on that branch and verify its source commit, run and timestamps; do not substitute latest-successful.json for a failed latest attempt. An absent or older record does not verify current code.

For the browser-test batch, read docs/simplicity-browser-status.md and ci-results:simplicity-browser/latest.json. Keep browser-job outcomes separate from the Simplicity unit/feed verification job. Test implementation and syntax checks do not establish browser execution or a passing workflow.

## Outcome records

At meaningful checkpoints, update the relevant status document with what changed, verification evidence and its provenance, known limitations, pending migrations/deployments, and concrete next steps. Keep committed, tested, deployed and enabled states separate. Do not rely on chat history as the only handover. Never invent CI run IDs or claim an entire workflow passed from one step's output.

## Boundaries

- Keep personal balances, transaction exports, positions, credentials and notification destinations out of this public repository and public assets.
- Preserve account isolation and existing stock-price behaviour. Run account/runtime regressions when their entry points change.
- Fund observation date, retrieval timestamp, cache TTL and publication freshness are separate concepts. A successful download does not independently verify fund identity.
- Do not apply remote migrations, deploy, enable feature flags, activate alerts or send test notifications merely because code or tests were approved. Obtain the action-specific approval required by the execution environment.
- Never bypass D1 and its refresh coordination when fund persistence is unavailable.

## Simplicity research and documentation

Keep [docs/simplicity-status.md](docs/simplicity-status.md) as the authoritative consolidated checkpoint. Its historical sections are dated evidence, not current production verification.

- [Documentation map](docs/simplicity/documentation-map.md): research records and integration plan; its original local-bundle wording is historical preparation context, not current commit status.
- [Research log](docs/simplicity/research.md): observations, decisions, uncertainty and planned evidence collection.
- [Modelling design](docs/simplicity/design.md): proposed records and calculation boundaries, not an implemented model.
- [Source inventory](config/simplicity/sources.json): research-only provenance; reported retrieval is not source review or modelling approval.
- [Project-instructions draft](docs/simplicity/project-instructions.md): copyable settings text; repository commits do not update project settings.
- [Release handover](docs/simplicity-ui-release.md): historical release context; resolve current manifest pins and result records before any release action.

Cover KiwiSaver and Investment funds without merging their identities or price series. Verify the full official catalogue; the initial nine-fund document inventory is not exhaustive. Preserve exact source URLs, revisions, dates, supporting passages and unknowns. AI-extracted parameters remain provisional until reviewed. Use deterministic tested calculations and keep official observations, unpublished-price estimates and forward scenarios separate. Research does not authorise numerical estimate availability, executable switch prices, release actions or alert activation.
