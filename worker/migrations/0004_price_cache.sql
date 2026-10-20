-- Shared market data only; independent of private account/session tables.
CREATE TABLE price_cache_entries (
 dataset TEXT NOT NULL,
 symbol TEXT NOT NULL,
 kind TEXT NOT NULL CHECK (kind IN ('history','latest')),
 payload TEXT CHECK (payload IS NULL OR (json_valid(payload) AND length(CAST(payload AS BLOB))<=131072)),
 checked_at INTEGER NOT NULL DEFAULT 0,
 fresh_until INTEGER NOT NULL DEFAULT 0,
 retry_at INTEGER NOT NULL DEFAULT 0,
 failures INTEGER NOT NULL DEFAULT 0,
 lease_owner TEXT,
 lease_until INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(dataset,symbol,kind)
);
CREATE TABLE price_cache_budget (
 provider TEXT PRIMARY KEY NOT NULL,
 day_start INTEGER NOT NULL DEFAULT 0,
 day_calls INTEGER NOT NULL DEFAULT 0,
 minute_start INTEGER NOT NULL DEFAULT 0,
 minute_calls INTEGER NOT NULL DEFAULT 0,
 cooldown_until INTEGER NOT NULL DEFAULT 0
);
