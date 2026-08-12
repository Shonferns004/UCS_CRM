-- Single global receipt number sequence, seeded at the current max + 1 so new
-- receipts continue after existing numbers (audit 2026-08-12: global max 81831
-- in bsct). nextval is atomic, so getNextReceiptNo can never hand out the same
-- number twice even under concurrent writes — numbers are unique across all
-- NGOs (and therefore per NGO too).
CREATE SEQUENCE IF NOT EXISTS receipts_no_seq START WITH 81832;

-- Receipt numbers are unique per NGO — the same number legitimately exists in
-- different projects (e.g. bsct 58 and aflf 58 coexist). Run after the audit
-- confirmed zero duplicates, so this creates instantly.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_project_id_receipt_no_key') THEN
    ALTER TABLE receipts
      ADD CONSTRAINT receipts_project_id_receipt_no_key UNIQUE (project_id, receipt_no);
  END IF;
END $$;
