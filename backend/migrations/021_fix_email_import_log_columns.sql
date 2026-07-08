-- Fix missing columns in email_import_log (table may have been created without them)
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'imported';
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS raw_snippet TEXT;
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS account_id INT;
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS seen BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_email_import_log_status ON email_import_log(status);
CREATE INDEX IF NOT EXISTS idx_email_import_log_account_id ON email_import_log(account_id);
CREATE INDEX IF NOT EXISTS idx_email_import_log_seen ON email_import_log(seen);
