-- Preserve the original bank-statement payer name when a receipt is linked to
-- a donor profile during verification, so the payer can still be referenced
-- after donor_name is replaced with the donor's profile name.
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS bank_payer_name TEXT;
