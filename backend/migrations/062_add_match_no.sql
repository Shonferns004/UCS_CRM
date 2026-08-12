-- Match number: human-readable unique identifier for every bank audit entry
-- match (auto or manual). Shown on both the Audit and Leads views so a match
-- can be referenced across screens.
CREATE SEQUENCE IF NOT EXISTS bank_audit_match_no_seq;

ALTER TABLE bank_audit_entries
  ADD COLUMN IF NOT EXISTS match_no TEXT;

-- Backfill existing matches so no match is left without a number.
UPDATE bank_audit_entries
   SET match_no = 'MTCH-' || LPAD(nextval('bank_audit_match_no_seq')::text, 6, '0')
 WHERE match_no IS NULL
   AND match_status IN ('matched', 'confirmed');

CREATE INDEX IF NOT EXISTS idx_bank_audit_entries_match_no ON bank_audit_entries(match_no);
