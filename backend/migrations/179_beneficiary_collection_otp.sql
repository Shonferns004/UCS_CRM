-- 6-digit OTP generated when an operator accepts the "Already collected"
-- re-issue prompt on the beneficiaries app. Stored on the row so the
-- accounts panel's Beneficiaries section can display it.
ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS collection_otp TEXT;
ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS collection_otp_at TIMESTAMPTZ;
