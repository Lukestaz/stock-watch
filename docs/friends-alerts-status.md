# Friends email alerts: current status

Checkpoint: 2026-11-27 NZDT (previous checkpoint 2026-11-26). Checks last read at head `d88b3c6` on 2026-11-27 NZDT. This is a repository handover, not proof of production health. Verify the branch, commit and latest checks before relying on it.

## Revisions

- Draft PR #4 (`feature/multi-user-alerts`), head `06cd935`: the original work. Unmerged and unchanged.
- Draft PR #7 (`feat/friends-alerts-integration` into `main`): integration of PR #4 onto current main. Branch created from main `8b326d2`; the PR base later reported `20529aa` and is now main `30aa076`, which includes the squash merge of PR #8 (Simplicity CloudFront feeds). Head `a5f3dbb` is the branch after main was merged into it on 2026-11-26 with no conflict. Last friends code head: `38291b8`. I did not diff `38291b8` against `a5f3dbb`, so the absence of friends code changes in the main merge is inferred. Two docs-only commits followed: `b171432` (the 14 PR #4 worker documents and a status refresh) and `d88b3c6` (one-file fix to a copied document). The commit that records this checkpoint is also docs-only; its own checks have not been read.
- Capacity-full feedback: API and store changes in `692a6dc`; client change, new tests and status edits in `38291b8`.
- PR #4 worker documents: 14 files copied verbatim from `06cd935` (see below).

## Observed facts

| Fact | Source and method |
|---|---|
| Production D1 `d1_migrations` lists 11 names: `0001_accounts`, `0002_write_token`, `0003_identity`, `0004_price_cache`, `0005_account_alerts`, `0005_simplicity`, `0006_alert_email_challenges`, `0007_verification_mail_budget`, `0008_verification_requests`, `0009_account_alert_monitors`, `0010_account_email_dispatch`. | Output of the `Inspect production D1 schema` workflow (metadata only) run on main at `8b326d2`, supplied by the repository owner on 2026-11-26. I did not run it myself. |
| Production has the friends tables and the added delivery and reservation columns (`claim_token`, `claim_until`, `dispatch_token`, `send_started_at`, `last_error_category`, `consent_revision`, `purpose`). | Same report. |
| This branch's `worker/migrations` has the same 11 filenames. The six friends migrations are byte-identical (git blob SHA) to PR #4's. | GitHub connector directory listing compared with the report. |
| Friends `worker/src` modules, the three UI files, all 18 friends test files, the 12 friends workflows and the staging build script matched PR #4 by git blob SHA when compared. `account-alert-consent-api.mjs`, `account-alert-store.mjs`, `site/account-friends-email.mjs` and `account-symbol-capacity.test.mjs` have since been edited for capacity-full feedback and no longer match. | GitHub connector, compared after each push. |
| `worker/src/account-runtime.mjs` and `worker/test/account-runtime-friends-integration.test.mjs` are hand-written and not copies. | Reviewed from the commit diff `a849bac`. |
| The 14 PR #4 worker documents on this branch match PR #4 at `06cd935` by git blob SHA. At `b171432`, 13 matched; `VERIFICATION_PREVIEW.md` differed because I added a comma when retyping it. It was restored in `d88b3c6` and now has blob SHA `93e3eda`, the same as PR #4. | GitHub connector directory listings and a file read, 2026-11-27. The other 13 were not re-listed after `d88b3c6`; that commit changed only the one file. |
| `AGENTS.md` on this branch (blob `e5dd262`) already tells agents to read this document. I have not checked whether the same link is on main. | GitHub connector file read, 2026-11-27. |
| CI on PR #7: at `9aaf5b9`, `692a6dc` and `38291b8`, each head showed 16 checks succeeded, 1 failed (`verify`) and 2 `publish-summary` jobs skipped (they run only on pushes to main). | GitHub check runs read through the connector on 2026-11-26. For `9aaf5b9` and `692a6dc` the commit was inferred from the PR head and run start times; for `38291b8` the PR head was confirmed after the runs appeared. |
| CI on PR #7 at `a5f3dbb`: all 19 checks completed, 17 succeeded, 2 `publish-summary` jobs skipped, none failed. `verify` and `browser-tests` are among those that succeeded. | GitHub check runs read through the connector at 23:13 and 23:21 NZDT on 2026-11-26. Runs are attributed to `a5f3dbb` from the PR head and start times, not from a SHA in the check data. Job logs were not read, so there are no test counts. |
| CI on PR #7 at `d88b3c6`: all 19 checks completed, 17 succeeded, 2 `publish-summary` jobs skipped, none failed. `verify`, `browser-tests` and `adapter` are among those that succeeded. | GitHub check runs read through the connector on 2026-11-27 NZDT. Runs started at 06:46 NZDT, matching the push time, and are attributed to `d88b3c6` by timing, not from a SHA in the check data. Job logs were not read, so there are no test counts. Checks for `b171432` were not read separately. |
| In the `adapter` job at `38291b8` (step `node --test worker/test/account-*.test.mjs`, from `account-store-tests.yml`), the six new tests in `account-capacity-feedback.test.mjs` (numbered 101 to 106) and the five new diagnosis tests in `account-symbol-capacity.test.mjs` (numbered 255 to 259) reported `ok`. | Log output pasted by the repository owner on 2026-11-26 and searched by me. The TAP summary totals (`# pass`, `# fail`) were not found in my searches, so totals are not recorded. The job concluded success. The equivalent logs at `a5f3dbb` and `d88b3c6` were not read. |
| `verify` belongs to "Simplicity feed diagnostics". At `38291b8` (workflow run #29, failed in 49s; the run is identified by timing and duration, since the log does not name the commit) its feeds step (`node scripts/simplicity-outcomes.mjs feeds`) exited 1 because all 10 series returned HTTP 404 with `text/html` and `bytesRead` 0: six KiwiSaver (high-growth, growth, balanced, default, conservative, defensive) and four Investment (high-growth, growth, balanced, conservative). Output from an earlier run showed 9 of 10 feeds as HTTP 404 HTML and one timeout. | Step output pasted by the repository owner on 2026-11-26 for run #29; the earlier output was also owner-supplied. The names of the steps before it and the text of the run's one warning annotation were not seen. The step reads Simplicity feeds and does not exercise friends code (inferred from its name and output). |
| `verify` passes at `a5f3dbb` and `d88b3c6`. Main now contains PR #8 (squash `30aa076`), which moves the feeds to the published CloudFront links. That the merge is the reason `verify` now passes is an inference; the logs were not read. | GitHub check runs, as above, plus the PR #8 merge recorded in the repository. |
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
| CI-tested | Partly: all 19 checks completed with none failed at `d88b3c6`, including `verify`. The capacity-full tests are evidenced as `ok` only by the owner-supplied `adapter` log at `38291b8`; job logs at `a5f3dbb` and `d88b3c6` were not read. |
| Merged | No. PR #7 is a draft. (PR #8 is merged into main separately.) |
| Deployed | No code from this work. |
| Enabled | Not as far as this repository shows. The friends flags default off and are not set in repository configuration. Deployed bindings were not inspected. |

## Unknown

- Whether Worker bindings, secrets, flags or any cron trigger exist in production. The health endpoint could not be fetched through the review tool on 2026-11-26.
- Whether production's own Simplicity refresh was affected by the feed problem, and whether it is healthy now.
- Real delivery, quota behaviour and entitlement limits for Gmail and the market-data provider.

## Decisions recorded

- Migration filenames follow the production ledger. Do not renumber applied migrations.
- The friends layer stays off unless `ACCOUNTS_ENABLED` and `FRIENDS_ALERTS_ENABLED` are exactly `'true'`. Scheduling and enrolment need their own flags.
- Email is the only account channel. WhatsApp account delivery is not available.
- A failing check is not weakened or skipped to obtain a pass.
- The capacity message must not imply an account's own count, because the limit counts distinct symbols across all accounts.

## PR #4 worker documents

These 14 files were copied verbatim from PR #4 (`feature/multi-user-alerts` at `06cd935`) into `worker/`. Ten other PR #4 documents were already on this branch with matching blob SHAs. All 14 were compared by blob SHA with PR #4; one needed a correction (see Observed facts). The copied files describe PR #4 as it was written, including earlier states. Where they conflict with this document, this document governs.

`ACCOUNT_ALERT_PRODUCER.md`, `ACCOUNT_EMAIL_DISPATCH.md`, `ALERT_DESTINATION_API.md`, `ALERT_DESTINATION_INTEGRATION.md`, `ALERT_DESTINATION_STORE.md`, `BUDGETED_VERIFICATION.md`, `FRIENDS_FLOW_INTEGRATION.md`, `FRIENDS_RUNTIME.md`, `FRIENDS_UI_RELEASE.md`, `GMAIL_VERIFICATION_SERVICE.md`, `MULTI_USER_ALERTS.md`, `SYMBOL_CAPACITY.md`, `VERIFICATION_MAIL.md`, `VERIFICATION_PREVIEW.md`.

## Known gaps

- Capacity-full feedback passes its tests in local SQLite and fake DOM conditions. It has not been exercised against real D1 or in a real browser. The diagnosis runs after a failed write, so a slot freed in between can produce the generic conflict message instead.
- `SYMBOL_CAPACITY.md` (copied from PR #4) still describes capacity refusals as generic conflicts. Capacity-full feedback supersedes that. Other copied documents describe earlier states as unwired; `FRIENDS_RUNTIME.md` and `FRIENDS_UI_RELEASE.md` describe the wired default-off state.
- `migrate-production-friends-schema.yml` on main asserts a baseline of only migrations `0001` to `0004` and pins an old revision. Production already has all 11, so its preflight would fail. It is stale and should be retired in a separate change.
- Event and outbox history retention policy is not defined.
- Gmail and market-data usage is not counted against legacy jobs sharing the same accounts.

## Activation gates

Each needs separate, action-specific approval. Passing CI is not enough.

1. `verify` passes at `d88b3c6` (logs not read; the likely cause is main's PR #8 fix, which is inferred). Confirm from the log if this gate is relied on.
2. Provision separate staging resources (origin, Google client, D1 database, Worker, rate-limit namespace). The build helper refuses production identifiers.
3. Provision Worker bindings and secrets securely. Do not paste credentials into chat or the repository.
4. Run a staged two-account journey: sign in, verify email, opt in, receive a scheduled alert, opt out, and confirm no cross-account leakage.
5. Register and observe the schedule before enabling enrolment.
6. Approve the exact production flags, schedule and deployment, then verify real delivery after activation.

## Next steps

1. Retire the stale production migration workflow separately.
2. Read the job logs if `verify` or the capacity-full tests are relied on.
3. Decide separately on staging and the two-account acceptance test; each needs its own approval.
