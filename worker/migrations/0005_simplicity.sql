-- Public fund data only. No account or portfolio records.
CREATE TABLE IF NOT EXISTS simplicity_fetch_state (
  series_id TEXT PRIMARY KEY,
  fetched_at TEXT,
  checked_at INTEGER NOT NULL DEFAULT 0,
  fresh_until INTEGER NOT NULL DEFAULT 0,
  retry_at INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS simplicity_observations (
  series_id TEXT NOT NULL REFERENCES simplicity_fetch_state(series_id),
  as_of_date TEXT NOT NULL,
  price REAL NOT NULL CHECK(price > 0),
  PRIMARY KEY(series_id, as_of_date)
);
