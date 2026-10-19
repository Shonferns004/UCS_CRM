-- 192: beneficiary_type on operator_assignments (Operator Details dropdown)

ALTER TABLE operator_assignments ADD COLUMN IF NOT EXISTS beneficiary_type TEXT;
