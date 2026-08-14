-- 070: One-time cleanup — delete the Go Back'd receipts (81913, 81914, 81915)
-- that were not cancelled properly, and lower the per-NGO counters back so the
-- next receipt number continues from the last live number (81912 -> next is
-- 81913 again). Run AFTER 069_cancel_receipt_no.sql has been applied.
BEGIN;

-- Preview the rows that will be deleted.
SELECT id, receipt_no, project_id, donor_name, amount, log_id, donor_id, sent,
       (SELECT COUNT(*) FROM bank_audit_entries e WHERE e.receipt_id = r.id) AS linked_entries
FROM receipts r
WHERE receipt_no IN ('81913', '81914', '81915');

-- Unlink any bank audit entries pointing at these receipts first.
UPDATE bank_audit_entries
SET receipt_id = NULL,
    receipt_no = NULL,
    status = 'unverified'
WHERE receipt_id IN (SELECT id FROM receipts WHERE receipt_no IN ('81913', '81914', '81915'));

-- Delete the cancelled receipts.
DELETE FROM receipts WHERE receipt_no IN ('81913', '81914', '81915');

-- Lower every per-NGO counter back to its highest live number (never raises),
-- so cancelled numbers are reused instead of skipped.
UPDATE receipt_no_counters c
SET last_no = COALESCE(
  (SELECT MAX(CASE WHEN r.receipt_no ~ '^[0-9]+$' THEN r.receipt_no::bigint END)
   FROM receipts r WHERE r.project_id = c.project_id), 0)
WHERE c.last_no > COALESCE(
  (SELECT MAX(CASE WHEN r.receipt_no ~ '^[0-9]+$' THEN r.receipt_no::bigint END)
   FROM receipts r WHERE r.project_id = c.project_id), 0);

COMMIT;
