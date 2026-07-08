CREATE TABLE IF NOT EXISTS razorpay_accounts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  key_id TEXT NOT NULL,
  key_secret TEXT NOT NULL,
  webhook_secret TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_razorpay_accounts_active ON razorpay_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_razorpay_accounts_default ON razorpay_accounts(is_default);

-- Ensure at most one default account (enforced at app layer as well)
