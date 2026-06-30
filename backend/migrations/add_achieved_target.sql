ALTER TABLE fro_monthly_targets
ADD COLUMN IF NOT EXISTS achieved_target numeric(12,2) DEFAULT 0;
