-- Internal per-save ownership marker; never return it to clients.
-- Apply after 0001_accounts.sql to the private account database only.
ALTER TABLE watchlists ADD COLUMN write_token TEXT;
