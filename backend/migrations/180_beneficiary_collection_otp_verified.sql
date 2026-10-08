-- Set when the collection OTP is verified; kit re-issue (override) from the
-- beneficiaries app requires this. Cleared whenever a new OTP is generated.
ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS collection_otp_verified_at TIMESTAMPTZ;
