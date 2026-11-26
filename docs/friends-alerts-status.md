# Friends email alerts: current status

Checkpoint: 2026-11-26 NZDT. This is a repository handover, not proof of production health. Verify the branch, commit and latest checks before relying on it.

## Revisions

- Draft PR #4 (`feature/multi-user-alerts`), head `06cd935`: the original work. Unmerged and unchanged.
- Draft PR #7 (`feat/friends-alerts-integration` into `main`): integration of PR #4 onto current main. Branch created from main `8b326d2`; the PR base later reported `20529aa`. Last code head before this document: `9aaf5b9`.

## Observed facts

| Fact | Source and method |
|---|---|
| Production D1 `d1_migrations` lists 11 names: `0001_accounts`, `0002_write_token`, `0003_identity`, `0004_price_cache`, `0005_account_alerts`, `0005_simplicity`, `0006_alert_email_challenges`, `0007_verification_mail_budget`, `0008_verification_requests`, `0009_account_alert_monitors`, `0010_account_email_dispatch`. | Output of the `Inspect production D1 schema` workflow (metadata only) run on main at `8b326d2`, supplied by the repository owner on 2026-11-26. I did not run it myself. |
| Production has the friends tables and the added delivery and reservation columns (`claim_token`, `claim_until`, `dispatch_token`, `send_started_at`, `last_error_category`, `consent_revision`, `purpose`). | Same report. |
| This branch's `worker/migrations` has the same 11 filenames. The six friends migrations are byte-identical (git blob SHA) to PR #4's. | GitHub connector directory listing compared with the report. |
| Friends `worker/src` modules, the three UI files, all 18 friends test files, the 12 friends workflows and the staging build script match PR #4 by git blob SHA. | GitHub connector, compared after each push. |
| `worker/src/account-runtime.mjs` and `worker/test/account-runtime-friends-integration.test.mjs` are hand-written and not copies. | Reviewed from the commit diff `a849bac`. |
| CI on PR #7 at head `9aaf5b9`: 16 checks succeeded, 1 failed (`verify`), 2 `publish-summary` jobs were skipped (they run only on pushes to main). | GitHub check runs read through the connector on 2026-11-26. |
| `verify` belongs to "Simplicity feed diagnostics". Its live-feed step reported HTTP 404 HTML for 9 of 10 feeds and a timeout for the tenth. | Step output supplied by the repository owner. Other `verify` steps were not inspected. The owner states the feed is being fixed at source (owner-supplied, not independently verified). |
| `verify` also failed on draft PR #6 on 2026-11-24, before the integration work. | GitHub check runs. |

## What is implemented (committed, not deployed)

- Email destination registration and one-time verification, with account-bound sessions, hashed challenges, request admission limits and a shared mail budget.
- Per-stock email opt-in and opt-out with revision checks, an enrolment gate, a paused-selection guard and a 20 distinct symbol capacity limit.
- Alert evaluation from delayed one-minute bars (15 to 60 minutes old), an account-scoped outbox with leases, final eligibility rechecks and recorded outcomes, and a Gmail SMTP transport.
- A scheduled handler and delayed market source, wired through the account runtime behind default-off flags.
- Account-panel UI that mounts only when `/api/health` reports `friendsAlerts.verificationReady === true`.

## Evidence scope

Tests use local SQLite with the full migration chain, fake SMTP sockets, seeded sessions and observations, and mocked fetches. They show the logic and isolation rules behave as designed in those conditions. They do not establish actual Cloudflare D1 behaviour, Gmail delivery or TLS in the Workers runtime, Alpaca SIP entitlement, cron operation, or a real two-account browser journey.

## Current state

| State | Status |
|---|---|
| Committed | Yes, on PR #7's branch. |
| CI-tested | Partly: friends workflows pass; `verify` fails on the external feed step. |
| Merged | No. |
| Deployed | No code from this work. |
| Enabled | Not as far as this repository shows. The friends flags default off and are not set in repository configuration. Deployed bindings were not inspected. |

## Unknown

- Whether Worker bindings, secrets, flags or any cron trigger exist in production. The health endpoint could not be fetched through the review tool on 2026-11-26.
- Whether production's own Simplicity refresh is affected by the feed problem.
- Real delivery, quota behaviour and entitlement limits for Gmail and the market-data provider.

## Decisions recorded

- Migration filenames follow the production ledger. Do not renumber applied migrations.
- The friends layer stays off unless `ACCOUNTS_ENABLED` and `FRIENDS_ALERTS_ENABLED` are exactly `'true'`. Scheduling and enrolment need their own flags.
- Email is the only account channel. WhatsApp account delivery is not available.
- A failing check is not weakened or skipped to obtain a pass.

## Known gaps

- No dedicated capacity-full response or UI message. A refusal at the 20 symbol limit still appears as a generic conflict.
- The original PR #4 worker documents are not yet copied to this branch. Some describe earlier states as unwired; this document supersedes them where they conflict.
- `migrate-production-friends-schema.yml` on main asserts a baseline of only migrations `0001` to `0004` and pins an old revision. Production already has all 11, so its preflight would fail. It is stale and should be retired in a separate change.
- Event and outbox history retention policy is not defined.
- Gmail and market-data usage is not counted against legacy jobs sharing the same accounts.

## Activation gates

Each needs separate, action-specific approval. Passing CI is not enough.

1. Resolve `verify` or document it as external and accepted.
2. Provision separate staging resources (origin, Google client, D1 database, Worker, rate-limit namespace). The build helper refuses production identifiers.
3. Provision Worker bindings and secrets securely. Do not paste credentials into chat or the repository.
4. Run a staged two-account journey: sign in, verify email, opt in, receive a scheduled alert, opt out, and confirm no cross-account leakage.
5. Register and observe the schedule before enabling enrolment.
6. Approve the exact production flags, schedule and deployment, then verify real delivery after activation.

## Next steps

1. Build the capacity-full response and message, with tests.
2. Copy the PR #4 documents or reference them from this one.
3. Link this document from `AGENTS.md`.
4. Retire the stale production migration workflow separately.
