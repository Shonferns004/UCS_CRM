-- Entries can be saved without a receipt number: the Accounts "Add Entry"
-- flow deliberately stores NULL receipt_no for suspense entries (no formal
-- receipt number is assigned yet). The UNIQUE(project_id, receipt_no)
-- constraint from migration 064 is unaffected — NULLs are allowed in unique
-- indexes, so suspense rows don't collide with numbered receipts.
ALTER TABLE receipts ALTER COLUMN receipt_no DROP NOT NULL;
