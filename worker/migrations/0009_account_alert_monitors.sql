-- Candidate account email evaluation only. No schedule or sending is enabled.
ALTER TABLE account_alert_deliveries ADD COLUMN consent_revision INTEGER NOT NULL DEFAULT 0
 CHECK (typeof(consent_revision)='integer' AND consent_revision>=0);
CREATE TABLE account_alert_monitors (
 user_id TEXT NOT NULL,
 symbol TEXT NOT NULL,
 target_revision INTEGER NOT NULL CHECK (typeof(target_revision)='integer' AND target_revision>=0),
 consent_revision INTEGER NOT NULL CHECK (typeof(consent_revision)='integer' AND consent_revision>0),
 enabled_at INTEGER NOT NULL CHECK (typeof(enabled_at)='integer' AND enabled_at>0),
 last_observed_at INTEGER NOT NULL CHECK (typeof(last_observed_at)='integer' AND last_observed_at>=0),
 armed_near INTEGER NOT NULL DEFAULT 1 CHECK (armed_near IN (0,1)),
 armed_target INTEGER NOT NULL DEFAULT 1 CHECK (armed_target IN (0,1)),
 evaluation_token TEXT,
 PRIMARY KEY(user_id,symbol),
 FOREIGN KEY(user_id,symbol) REFERENCES watchlist_entries(user_id,symbol) ON DELETE CASCADE
);
