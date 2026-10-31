-- Private account-alert foundation only. Apply separately after review.
-- No enrolment, verification, scheduling or delivery is enabled by this file.
CREATE TABLE alert_destinations (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 channel TEXT NOT NULL CHECK (channel IN ('email','whatsapp')),
 address TEXT NOT NULL CHECK (length(address) BETWEEN 1 AND 320 AND instr(address,char(10))=0 AND instr(address,char(13))=0),
 provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 64),
 provider_binding_ref TEXT CHECK (provider_binding_ref IS NULL OR length(provider_binding_ref) BETWEEN 1 AND 256),
 revision INTEGER NOT NULL DEFAULT 1 CHECK (typeof(revision)='integer' AND revision>0),
 verified_at INTEGER CHECK (verified_at IS NULL OR (typeof(verified_at)='integer' AND verified_at>0)),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
 PRIMARY KEY (user_id,channel),
 CHECK (enabled=0 OR verified_at IS NOT NULL)
);
-- A changed destination/binding requires fresh verification and explicit opt-in.
CREATE TRIGGER alert_destination_changed
AFTER UPDATE OF address,provider,provider_binding_ref ON alert_destinations
WHEN NEW.address IS NOT OLD.address OR NEW.provider IS NOT OLD.provider
 OR NEW.provider_binding_ref IS NOT OLD.provider_binding_ref
BEGIN
 UPDATE alert_destinations SET revision=OLD.revision+1,verified_at=NULL,enabled=0
 WHERE user_id=OLD.user_id AND channel=OLD.channel;
END;
CREATE TABLE account_alert_events (
 user_id TEXT NOT NULL,
 symbol TEXT NOT NULL,
 target_revision INTEGER NOT NULL CHECK (typeof(target_revision)='integer' AND target_revision>=0),
 kind TEXT NOT NULL CHECK (kind IN ('near','target')),
 observed_at INTEGER NOT NULL CHECK (typeof(observed_at)='integer' AND observed_at>0),
 target_usd REAL NOT NULL CHECK (target_usd>0 AND target_usd<=1000000000),
 low_usd REAL NOT NULL CHECK (low_usd>0 AND low_usd<=1000000000),
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 PRIMARY KEY (user_id,symbol,target_revision,kind,observed_at),
 FOREIGN KEY (user_id,symbol) REFERENCES watchlist_entries(user_id,symbol) ON DELETE CASCADE,
 CHECK ((kind='target' AND low_usd<=target_usd) OR
        (kind='near' AND low_usd>target_usd AND low_usd<=target_usd*1.05))
);
CREATE TABLE account_alert_deliveries (
 user_id TEXT NOT NULL,
 symbol TEXT NOT NULL,
 target_revision INTEGER NOT NULL,
 kind TEXT NOT NULL,
 observed_at INTEGER NOT NULL,
 channel TEXT NOT NULL CHECK (channel IN ('email','whatsapp')),
 destination_revision INTEGER NOT NULL CHECK (typeof(destination_revision)='integer' AND destination_revision>0),
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','accepted','outcome_unknown','failed','expired','superseded','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK (typeof(attempts)='integer' AND attempts BETWEEN 0 AND 3),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
 PRIMARY KEY (user_id,symbol,target_revision,kind,observed_at,channel),
 FOREIGN KEY (user_id,symbol,target_revision,kind,observed_at)
  REFERENCES account_alert_events(user_id,symbol,target_revision,kind,observed_at) ON DELETE CASCADE,
 FOREIGN KEY (user_id,channel) REFERENCES alert_destinations(user_id,channel) ON DELETE CASCADE
);
CREATE INDEX account_alert_delivery_queue ON account_alert_deliveries(status,updated_at);
