# Private watchlist adapter (not deployed)

createD1WatchlistStore(db) implements the account handler's read/replace interface. It is not imported into the live Worker, and no D1 binding is added. Account creation and verified-session authentication remain separate work.

Apply 0001_accounts.sql then 0002_write_token.sql only to a separately approved private database. Do not apply migrations to a production database as part of tests.

A save uses one D1 batch: revision compare-and-swap assigns a fresh random write_token; every later mutation checks that token; the final snapshot is returned from the same batch. A stale update cannot match another request's token. D1 batch transaction semantics are required; never split these statements into independent requests. Reads use one SQL statement for consistent metadata and ordered entries. Tokens are not returned to clients.

All statements bind the trusted server-derived user ID. The adapter does not authenticate callers; the session layer must supply that identity. Do not expose a client-selectable user ID. Missing accounts are not automatically provisioned.

Saves increment the watchlist revision, preserve monitor_applied_revision, and change an existing target_revision only when its target changes. New or re-added entries use the new watchlist revision, avoiding revision reuse on delete/re-add. No-op saves still increment the list revision.

Enrollment is unavailable. Incoming enabled alerts are rejected. If a stored watchlist already has active alerts, replacement returns null without changes rather than silently disabling/removing them. The current handler reports this as a conflict; a distinct enrollment-policy response is needed before enabling the notification path. Existing channel flags on retained inactive entries are preserved.

Local tests run the actual JS adapter with parameterized SQL executed by Python against temporary file-backed SQLite databases. The bridge supplies transactional batch behaviour and is test-only; it is not a Cloudflare SDK or a D1 emulator. Tests cover two-user scoping, stale saves, overlapping writers, rollback, 100-entry replacement/order/clear, target revision handling, active-alert preservation and invalid inputs. Google/session authorization is not tested by these adapter tests.

Run: node --test worker/test/account-api.test.mjs worker/test/account-store.test.mjs

Before deployment: verify both migrations, JSON functions, RETURNING, result shapes, rollback, concurrency and primary-read behaviour on actual D1; add authenticated end-to-end user-isolation tests. No Cloudflare resources or real notifications are used by the CI workflow.
