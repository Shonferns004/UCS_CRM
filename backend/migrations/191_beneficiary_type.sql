-- 191: beneficiary_type — operator dropdown on the beneficiaries app
-- (Visually Impaired Individuals, Persons with Disabilities (PwD), ... Daily Wage Workers)

ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS beneficiary_type TEXT;

CREATE INDEX IF NOT EXISTS idx_beneficiaries_beneficiary_type ON beneficiaries (beneficiary_type);
