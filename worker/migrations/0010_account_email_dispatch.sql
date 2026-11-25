-- Private email dispatch claims only. No runtime/schedule is enabled.
ALTER TABLE account_alert_deliveries ADD COLUMN claim_token TEXT;
ALTER TABLE account_alert_deliveries ADD COLUMN claim_until INTEGER;
ALTER TABLE account_alert_deliveries ADD COLUMN dispatch_token TEXT;
ALTER TABLE account_alert_deliveries ADD COLUMN send_started_at INTEGER;
ALTER TABLE account_alert_deliveries ADD COLUMN last_error_category TEXT;
CREATE INDEX account_email_claims ON account_alert_deliveries(channel,status,claim_until);
ALTER TABLE verification_mail_reservations ADD COLUMN purpose TEXT NOT NULL DEFAULT 'verification'
 CHECK (purpose IN ('verification','price-alert'));
CREATE INDEX mail_purpose_user_time ON verification_mail_reservations(purpose,user_id,created_at);
CREATE INDEX mail_purpose_destination_time ON verification_mail_reservations(purpose,destination_hash,created_at);
