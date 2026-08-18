-- Migration 075: Add editable_until column to bank_audit_entries
-- The column exists on production (added via dashboard) but staging is missing it.
ALTER TABLE bank_audit_entries ADD COLUMN IF NOT EXISTS editable_until TIMESTAMPTZ;
