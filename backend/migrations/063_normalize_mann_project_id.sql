-- 063: Normalize the MANN NGO project code from 'maan' to 'mann'.
-- The canonical project_id for Mann Care Foundation is 'mann' everywhere
-- (receipts, bank audit entries, FRO suspense, keyword matching). 'maan' was
-- only ever used by the bank-audit entry form and bank-audit-created receipts.
UPDATE receipts SET project_id = 'mann' WHERE project_id = 'maan';
UPDATE bank_audit_entries SET project_id = 'mann' WHERE project_id = 'maan';
