CREATE TABLE IF NOT EXISTS daily_qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_code_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  daily_code VARCHAR(4) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(date, daily_code),
  UNIQUE(qr_code_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_qr_codes_date ON daily_qr_codes(date);
CREATE INDEX IF NOT EXISTS idx_daily_qr_codes_qr_id ON daily_qr_codes(qr_code_id);
