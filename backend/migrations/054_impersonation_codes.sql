CREATE TABLE IF NOT EXISTS impersonation_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(4) NOT NULL,
  ngo_id UUID,
  created_by UUID,
  created_by_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by UUID,
  is_used BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_impersonation_codes_code ON impersonation_codes(code);
CREATE INDEX IF NOT EXISTS idx_impersonation_codes_ngo ON impersonation_codes(ngo_id);
