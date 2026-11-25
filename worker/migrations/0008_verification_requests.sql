-- Private verification request limits only; do not apply automatically.
CREATE TABLE verification_request_attempts (
 id TEXT PRIMARY KEY NOT NULL,
 scope TEXT NOT NULL CHECK (scope IN ('admission','registration','verification')),
 actor_hash TEXT NOT NULL CHECK (length(actor_hash)=64 AND actor_hash NOT GLOB '*[^a-f0-9]*'),
 created_at INTEGER NOT NULL CHECK (typeof(created_at)='integer' AND created_at>0)
);
CREATE INDEX verification_request_global_time ON verification_request_attempts(scope,created_at);
CREATE INDEX verification_request_actor_time ON verification_request_attempts(scope,actor_hash,created_at);
