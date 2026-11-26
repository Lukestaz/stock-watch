# Friends email alerts: current status

Checkpoint: 2026-11-26 NZDT. This is a repository handover, not proof of production health. Verify the branch, commit and latest checks before relying on it.

## Revisions

- Draft PR #4 (`feature/multi-user-alerts`), head `06cd935`: the original work. Unmerged and unchanged.
- Draft PR #7 (`feat/friends-alerts-integration` into `main`): integration of PR #4 onto current main. Branch created from main `8b326d2`; the PR base later reported `20529aa`. Last code head: `38291b8`. Documentation commits after it do not change code.
- Capacity-full feedback: API and store changes in `692a6dc`; client change, new tests and status edits in `38291b8`.

## Observed facts

| Fact | Source and method |
|---|---|
| Production D1 `d1_migrations` lists 11 names: `0001_accounts`, `0002_write_token`, `0003_identity`, `0004_price_cache`, `0005_account_alerts`, `0005_simplicity`, `0006_alert_email_challenges`, `0007_verification_mail_budget`, `0008_verification_requests`, `0009_account_alert_monitors`, `0010_account_email_dispatch`. | Output of the `Inspect production D1 schema` workflow (metadata only) run on main at `8b326d2`, supplied by the repository owner on 2026-11-26. I did not run it myself. |
| Production has the friends tables and the added delivery and reservation columns (`claim_token`, `claim_until`, `dispatch_token`, `send_started_at`, `last_error_category`, `consent_revision`, `purpose`). | Same report. |
| This branch's `worker/migrations` has the same 11 filenames. The six friends migrations are byte-identical (git blob SHA) to PR #4's. | GitHub connector directory listing compared with the report. |
| Friends `worker/src` modules, the three UI files, all 18 friends test files, the 12 friends workflows and the staging build script matched PR #4 by git blob SHA when compared. `account-alert-consent-api.mjs`, `account-alert-store.mjs`, `site/account-friends-email.mjs` and `account-symbol-capacity.test.mjs` have since been edited for capacity-full feedback and no longer match. | GitHub connector, compared after each push. |
| `worker/src/account-runtime.mjs` and `worker/test/account-runtime-friends-integration.test.mjs` are hand-written and not copies. | Reviewed from the commit diff `a849bac`. |
| CI on PR #7: at `9aaf5b9`, `692a6dc` and `38291b8`, each head showed 16 checks succeeded, 1 failed (`verify`) and 2 `publish-summary` jobs skipped (they run only on pushes to main). | GitHub check runs read through the connector on 2026-11-26. For `9aaf5b9` and `692a6dc` the commit was inferred from the PR head and run start times; for `38291b8` the PR head was confirmed after the runs appeared. |
| In the `adapter` job at `38291b8` (step `node --test worker/test/account-*.test.mjs`, from `account-store-tests.yml`), the six new tests in `account-capacity-feedback.test.mjs` (numbered 101 to 106) and the five new diagnosis tests in `account-symbol-capacity.test.mjs` (numbered 255 to 259) reported `ok`. | Log output pasted by the repository owner on 2026-11-26 and searched by me. The TAP summary totals (`# pass`, `# fail`) were not found in my searches, so totals are not recorded. The job concluded success. |
| `verify` belongs to "Simplicity feed diagnostics" (workflow run #29 at `38291b8`, failed in 49s; the run is identified by timing and duration, since the log does not name the commit). Its feeds step (`node scripts/simplicity-outcomes.mjs feeds`) exited 1 because all 10 series returned HTTP 404 with `text/html` and `bytesRead` 0: six KiwiSaver (high-growth, growth, balanced, default, conservative, defensive) and four Investment (high-growth, growth, balanced, conservative). Output from an earlier run showed 9 of 10 feeds as HTTP 404 HTML and one timeout. | Step output pasted by the repository owner on 2026-11-26 for run #29; the earlier output was also owner-supplied. The names of the steps before it and the text of the run's one warning annotation were not seen. The step reads Simplicity feeds and does not exercise friends code (inferred from its name and output). The owner states the feed is being fixed at source (owner-supplied, not independently verified); as of run #29 it was not yet fixed. |
| `verify` also failed on draft PR #6 on 2026-11-24, before the integration work. | GitHub check runs. |

## What is implemented (committed, not deployed)

- Email destination registration and one-time verification, with account-bound sessions, hashed challenges, request admission limits and a shared mail budget.
- Per-stock email opt-in and opt-out with revision checks, an enrolment gate, a paused-selection guard and a 20 distinct symbol email-alert limit shared across all accounts.
- A capacity-full response (HTTP 409 with code `capacity-full`) and panel message, distinct from the generic conflict. The new store method is read-only and reveals no counts or symbols.
- Alert evaluation from delayed one-minute bars (15 to 60 minutes old), an account-scoped outbox with leases, final eligibility rechecks and recorded outcomes, and a Gmail SMTP transport.
- A scheduled handler and delayed market source, wired through the account runtime behind default-off flags.
- Account-panel UI that mounts only when `/api/health` reports `friendsAlerts.verificationReady === true`.

## Evidence scope

Tests use local SQLite with the full migration chain, fake SMTP sockets, seeded sessions and observations, mocked fetches and a fake DOM. They show the logic and isolation rules behave as designed in those conditions. They do not establish actual Cloudflare D1 behaviour, Gmail delivery or TLS in the Workers runtime, Alpaca SIP entitlement, cron operation, the panel in a real browser, or a real two-account journey.

## Current state

| State | Status |
|---|---|
| Committed | Yes, on PR #7's branch. |
| CI-tested | Partly: friends workflows pass at `38291b8`, including the new capacity-full tests in the `adapter` job (owner-supplied log). `verify` fails on the external feed step. |
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
- The capacity message must not imply an account's own count, because the limit counts distinct symbols across all accounts.

## Known gaps

- Capacity-full feedback passes its tests in local SQLite and fake DOM conditions. It has not been exercised against real D1 or in a real browser. The diagnosis runs after a failed write, so a slot freed in between can produce the generic conflict message instead.
- The original PR #4 worker documents are not yet copied to this branch. Some describe earlier states as unwired, and `SYMBOL_CAPACITY.md` describes capacity refusals as generic conflicts; this document supersedes them where they conflict.
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

1. Copy the PR #4 documents or reference them from this one.
2. Link this document from `AGENTS.md`.
3. Retire the stale production migration workflow separately.
