-- Link bank audit entries to generated receipts: every manual entry gets a
-- receipt number + a receipts row at creation time. Deleting the entry removes
-- the linked receipt (handled in bankAuditController.removeEntry).
ALTER TABLE bank_audit_entries
  ADD COLUMN IF NOT EXISTS receipt_no TEXT,
  ADD COLUMN IF NOT EXISTS receipt_id INTEGER REFERENCES receipts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bank_audit_entries_receipt_id ON bank_audit_entries(receipt_id);
