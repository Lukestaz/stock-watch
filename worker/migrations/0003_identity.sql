-- Private identity state. Never publish these tables or tokens.
CREATE TABLE login_challenges (
 challenge_hash TEXT PRIMARY KEY NOT NULL CHECK (length(challenge_hash)=64),
 created_at INTEGER NOT NULL CHECK (typeof(created_at)='integer'),
 expires_at INTEGER NOT NULL CHECK (typeof(expires_at)='integer' AND expires_at>created_at),
 used_by TEXT CHECK (used_by IS NULL OR length(used_by)=64)
);
CREATE INDEX login_challenges_expiry ON login_challenges(expires_at);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY NOT NULL CHECK (length(token_hash)=64),
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL CHECK (typeof(created_at)='integer'),
 last_seen_at INTEGER NOT NULL CHECK (typeof(last_seen_at)='integer' AND last_seen_at>=created_at),
 expires_at INTEGER NOT NULL CHECK (typeof(expires_at)='integer' AND expires_at>created_at)
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
