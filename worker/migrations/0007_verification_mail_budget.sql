-- Verification-mail attempt reservations only. No migration auto-apply or sends.
-- Retain reservations across account/destination deletion to prevent quota refunds.
CREATE TABLE verification_mail_reservations (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL,
 destination_hash TEXT NOT NULL CHECK (length(destination_hash)=64 AND destination_hash NOT GLOB '*[^a-f0-9]*'),
 created_at INTEGER NOT NULL CHECK (typeof(created_at)='integer' AND created_at>0)
);
CREATE INDEX verification_mail_global_time ON verification_mail_reservations(created_at);
CREATE INDEX verification_mail_user_time ON verification_mail_reservations(user_id,created_at);
CREATE INDEX verification_mail_destination_time ON verification_mail_reservations(destination_hash,created_at);
