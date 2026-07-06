CREATE TABLE IF NOT EXISTS payment_webhook_log (
  id SERIAL PRIMARY KEY,
  gateway TEXT NOT NULL,
  event_type TEXT,
  payment_id TEXT,
  order_id TEXT,
  amount DECIMAL(12,2),
  gateway_source TEXT,
  sender_name TEXT,
  sender_email TEXT,
  sender_phone TEXT,
  raw_payload JSONB,
  bank_entry_id INT REFERENCES bank_audit_entries(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'received',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_log_gateway ON payment_webhook_log(gateway);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_log_payment_id ON payment_webhook_log(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_log_status ON payment_webhook_log(status);
