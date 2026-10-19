-- Apply only to a separately provisioned private account database.
-- This migration is not wired into deployment.
CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  google_sub TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE watchlists (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  monitor_applied_revision INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (monitor_applied_revision IS NULL OR
    (monitor_applied_revision >= 0 AND monitor_applied_revision <= revision))
);
CREATE TABLE watchlist_entries (
  user_id TEXT NOT NULL REFERENCES watchlists(user_id) ON DELETE CASCADE,
  symbol TEXT NOT NULL CHECK (length(symbol) BETWEEN 1 AND 15 AND symbol = upper(symbol)),
  target_usd REAL NOT NULL CHECK (target_usd > 0 AND target_usd <= 1000000000),
  position INTEGER NOT NULL CHECK (position >= 0),
  alerts_enabled INTEGER NOT NULL DEFAULT 0 CHECK (alerts_enabled IN (0, 1)),
  email_enabled INTEGER NOT NULL DEFAULT 0 CHECK (email_enabled IN (0, 1)),
  whatsapp_enabled INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp_enabled IN (0, 1)),
  target_revision INTEGER NOT NULL DEFAULT 0 CHECK (target_revision >= 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, symbol),
  CHECK (alerts_enabled = 0 OR email_enabled = 1 OR whatsapp_enabled = 1)
);
CREATE INDEX watchlist_entries_order ON watchlist_entries(user_id, position, symbol);
