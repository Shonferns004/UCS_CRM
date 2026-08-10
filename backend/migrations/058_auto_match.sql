-- Auto-match: NGO on every bank entry + suggested match state for the
-- auto-match engine. Entries get a suggested pending lead (matched_lead_log_id)
-- with a score; Accounts confirms before any credit happens.
ALTER TABLE bank_audit_entries
  ADD COLUMN IF NOT EXISTS project_id TEXT DEFAULT 'bsct',
  ADD COLUMN IF NOT EXISTS matched_lead_log_id INTEGER,
  ADD COLUMN IF NOT EXISTS match_score INTEGER,
  ADD COLUMN IF NOT EXISTS match_status TEXT,
  ADD COLUMN IF NOT EXISTS matched_by UUID;

CREATE INDEX IF NOT EXISTS idx_bank_audit_entries_match_status ON bank_audit_entries(match_status);
CREATE INDEX IF NOT EXISTS idx_bank_audit_entries_project_id ON bank_audit_entries(project_id);
