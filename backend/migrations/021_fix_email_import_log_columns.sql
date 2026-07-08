-- Add every column that email_import_log needs (table was created without them)
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS email_message_id TEXT;
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS email_subject TEXT;
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS email_from TEXT;
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS parsed_amount DECIMAL(12,2);
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS parsed_payment_id TEXT;
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS parsed_transaction_date DATE;
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS parsed_source TEXT;
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS parsed_sender_name TEXT;
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS bank_entry_id INT REFERENCES bank_audit_entries(id) ON DELETE SET NULL;
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'imported';
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS raw_snippet TEXT;
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS account_id INT;
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS seen BOOLEAN DEFAULT false;
ALTER TABLE email_import_log ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Unique constraint on email_message_id (needed for dedup)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_import_log_email_message_id_key'
  ) THEN
    ALTER TABLE email_import_log ADD CONSTRAINT email_import_log_email_message_id_key UNIQUE (email_message_id);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_import_log_status ON email_import_log(status);
CREATE INDEX IF NOT EXISTS idx_email_import_log_message_id ON email_import_log(email_message_id);
CREATE INDEX IF NOT EXISTS idx_email_import_log_account_id ON email_import_log(account_id);
CREATE INDEX IF NOT EXISTS idx_email_import_log_seen ON email_import_log(seen);
