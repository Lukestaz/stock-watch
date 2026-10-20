# Reconstructed price-cache core: not deployed

This is reconstructed code, not a recovered copy of the vanished work. It adds migration 0004, a D1-backed cache/coordinator, an Alpaca loader and isolated tests. No existing price/app entry point or deployment workflow is changed. No migration has been applied remotely and no live DB binding has been installed.

## Storage and refresh

Use the existing stock-watch database (4cb54afc-8f2d-4f62-8b6b-7d59f343b938), not another database. The new price_cache_entries and price_cache_budget tables are independent of account/session tables. Rows are keyed by dataset, symbol and history/latest kind; bump the dataset version if feed or adjustment semantics change.

History is refreshed on demand after 24 hours, including a full history rebuild to pick up adjustments. Latest prices refresh after five minutes during a conservative weekday 09:30-16:30 America/New_York window, and hourly otherwise. This is not an exchange calendar: holidays and early closes are not modelled. Every provider query retains the existing minimum 16-minute delay. There is no timer or scheduled fetch without demand.

A 90-second D1 lease per symbol/kind coordinates refreshes across instances. Lease-owner checks prevent an expired owner from overwriting a newer result. This is not an exactly-once network guarantee: an expired or interrupted request can overlap a retry. Cold contenders return an unavailable result rather than launching another fetch; existing snapshots can be served stale. History and latest can be independently unavailable.

Successful payloads are kept during refresh failures. Explicit cache metadata carries checkedAt, freshUntil, state and reason; stale history is bounded to 35 days and stale latest data to seven days. A stale timestamp is never advanced on failure. Exponential retry backoff is 30 seconds up to one hour, with shared provider cooldown on 429 responses and provider retry hints.

Default safety budgets are 100 provider requests per fixed UTC minute and 5,000 per UTC day. They are application settings, not claims about the Alpaca plan. The Alpaca loader reserves a shared D1 budget slot before each HTTP attempt, including history pagination and failed requests. Other code using the same Alpaca account, including the current legacy Worker, is outside this counter. A custom loader must honour the supplied beforeRequest hook.

Admission is bounded to at most 1,000 cache rows, each with a maximum 128 KiB payload. Each symbol can use two rows. cleanup() removes expired negative entries and snapshots beyond their maximum age, excluding active leases. Cleanup scheduling and eviction policy must be wired before broader rollout.

## Staged composition

Create a loader with createAlpacaLoader({key: env.ALPACA_KEY, secret: env.ALPACA_SECRET}), then createPriceCache({db: env.DB, load}) and call get(symbol). This is a library contract, not a deployed handler. Keep the edge cache in front when integrating, and make the browser display stale/unavailable metadata truthfully. Do not fall back to unbudgeted provider fetches on D1 failure. Multi-symbol batching is not implemented in this patch.

Before rollout: verify migrations/bindings on real D1; choose provider budgets; integrate existing origin/client-rate-limit checks and bounded edge caching; add HTTP response mapping, stale UI and cleanup scheduling; test in Cloudflare; obtain separate deployment approval. No account feature is enabled by this work.

## Tests

node --test worker/test/price-cache*.test.mjs

The suite runs against file-backed SQLite through tests/schema/price_cache_bridge.py and uses mocked provider requests. It covers persistent reuse, independent TTLs, cross-instance leases, fencing expired owners, stale fallback/backoff, budgets and 429 cooldown, admission/cleanup, request bounds and pagination. It is not proof of live D1 behaviour, provider entitlements or deployment. Dedicated CI is read-only and has no provider secrets.
