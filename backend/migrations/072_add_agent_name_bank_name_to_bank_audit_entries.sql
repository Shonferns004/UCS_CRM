-- Migration 072: Add missing agent_name and bank_name columns to bank_audit_entries
-- creditService.js reads and writes these columns when confirming a match, but
-- the original table was created outside tracked migrations and these columns
-- were never added via ALTER TABLE.

ALTER TABLE bank_audit_entries ADD COLUMN IF NOT EXISTS agent_name TEXT;
ALTER TABLE bank_audit_entries ADD COLUMN IF NOT EXISTS bank_name TEXT;
