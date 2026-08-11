-- Donor contact details captured directly on the bank audit entry when the
-- accounts user fills them in the New Entry form (no donor profile created).
ALTER TABLE bank_audit_entries
  ADD COLUMN IF NOT EXISTS donor_mobile TEXT,
  ADD COLUMN IF NOT EXISTS donor_email TEXT,
  ADD COLUMN IF NOT EXISTS donor_pan TEXT,
  ADD COLUMN IF NOT EXISTS donor_address_1 TEXT,
  ADD COLUMN IF NOT EXISTS donor_address_2 TEXT,
  ADD COLUMN IF NOT EXISTS donor_city TEXT,
  ADD COLUMN IF NOT EXISTS donor_pin_code TEXT;
