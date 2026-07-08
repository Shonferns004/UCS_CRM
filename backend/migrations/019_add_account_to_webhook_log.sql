ALTER TABLE payment_webhook_log
  ADD COLUMN IF NOT EXISTS account_id INT,
  ADD COLUMN IF NOT EXISTS account_name TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_webhook_log_account_id
  ON payment_webhook_log(account_id);
