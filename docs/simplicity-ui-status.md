# Simplicity main update - 2026-11-09

Phase 1: retain the existing working downloader fix on main before the data-first UI update. Based on main 16fb8186e4c5644814a0f2e1c117896c725b1c8d. No new branch.

worker/src/simplicity-fetch.mjs exactly matches release blob cfdd804c531e8a32ce9c02eeccd00f3f390823d7: deferred globalThis.fetch and manual redirects. Non-success redirect responses are rejected, not followed. All existing URL, identity, timeout, size and CSV checks remain intact.

Local verification: five downloader tests passed against actual main parser/catalogue dependencies verified by Git blob hashes. The three existing tests are retained; two additional tests cover redirect rejection and the default fetch receiver. This is local regression evidence, not a full CI or production pass.

Pending phase 2: the prepared data-first UI, navigation and adapted browser tests are not committed by this phase. Their JavaScript syntax checks passed locally; browser execution remains pending. Require fresh CI results matched to each actual commit. Older handovers retain historical evidence only.

No deployment, migrations, feature activation, notifications, account changes or workflow changes. The app deployment remains manual and pinned to an older release. Before a separately approved deployment, reconcile the full main/release runtime and configuration differences; this downloader port alone does not establish deployment parity.
