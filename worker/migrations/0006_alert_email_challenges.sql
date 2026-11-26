-- Private verification storage only; no runtime or mail is enabled.
CREATE TABLE alert_email_challenges (
 user_id TEXT PRIMARY KEY NOT NULL,
 channel TEXT NOT NULL DEFAULT 'email' CHECK (channel='email'),
 challenge_hash TEXT NOT NULL UNIQUE CHECK (length(challenge_hash)=64 AND challenge_hash NOT GLOB '*[^a-f0-9]*'),
 destination_revision INTEGER NOT NULL CHECK (typeof(destination_revision)='integer' AND destination_revision>0),
 address TEXT NOT NULL,
 provider TEXT NOT NULL,
 provider_binding_ref TEXT,
 created_at INTEGER NOT NULL CHECK (typeof(created_at)='integer' AND created_at>0),
 expires_at INTEGER NOT NULL CHECK (typeof(expires_at)='integer' AND expires_at>created_at AND expires_at<=created_at+600),
 consumed_at INTEGER CHECK (consumed_at IS NULL OR (typeof(consumed_at)='integer' AND consumed_at>=created_at AND consumed_at<expires_at)),
 FOREIGN KEY (user_id,channel) REFERENCES alert_destinations(user_id,channel) ON DELETE CASCADE
);
CREATE INDEX alert_email_challenges_expiry ON alert_email_challenges(expires_at);
-- Consume and verify in the same database statement, or abort the statement.
CREATE TRIGGER alert_email_challenge_consumed
AFTER UPDATE OF consumed_at ON alert_email_challenges
WHEN OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL
BEGIN
 UPDATE alert_destinations SET verified_at=NEW.consumed_at,enabled=0
 WHERE user_id=NEW.user_id AND channel='email' AND revision=NEW.destination_revision
  AND address=NEW.address AND provider=NEW.provider AND provider_binding_ref IS NEW.provider_binding_ref;
 SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'Verification destination changed') END;
END;
