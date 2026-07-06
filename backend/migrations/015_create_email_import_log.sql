CREATE TABLE IF NOT EXISTS email_import_log (
  id SERIAL PRIMARY KEY,
  email_message_id TEXT UNIQUE NOT NULL,
  email_subject TEXT,
  email_from TEXT,
  received_at TIMESTAMPTZ,
  parsed_amount DECIMAL(12,2),
  parsed_payment_id TEXT,
  parsed_transaction_date DATE,
  parsed_source TEXT,
  parsed_sender_name TEXT,
  bank_entry_id INT REFERENCES bank_audit_entries(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'imported',
  error_message TEXT,
  raw_snippet TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_import_log_status ON email_import_log(status);
CREATE INDEX IF NOT EXISTS idx_email_import_log_message_id ON email_import_log(email_message_id);
