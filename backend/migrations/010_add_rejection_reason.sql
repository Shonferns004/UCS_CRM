ALTER TABLE fro_donor_logs
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
