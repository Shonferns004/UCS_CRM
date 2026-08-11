-- Manual match source: distinguishes bank audit entries matched by an
-- Accounts user (manual) from those suggested by the auto-match engine (auto).
ALTER TABLE bank_audit_entries
  ADD COLUMN IF NOT EXISTS match_source TEXT DEFAULT 'auto';
