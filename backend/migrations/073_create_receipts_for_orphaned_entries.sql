-- Migration 073: Create receipts for orphaned bank_audit_entries
-- Bank CSV uploads create bank_audit_entries WITHOUT receipts rows.
-- FRO Suspense only queries the receipts table, so these entries are
-- invisible to FROs. This migration creates receipts for all such entries
-- and links them back.

-- Step 1: Create receipts for orphaned entries
INSERT INTO receipts (project_id, donor_name, amount, receipt_date, agent_name, purpose, created_at)
SELECT
  COALESCE(b.project_id, 'bsct'),
  b.payer_name,
  b.amount,
  b.transaction_date,
  'Suspense',
  'Bank Audit Entry',
  NOW()
FROM bank_audit_entries b
WHERE b.receipt_id IS NULL
  AND b.status = 'unverified'
  AND b.payer_name IS NOT NULL
  AND trim(b.payer_name) != ''
  AND b.transaction_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM receipts r
    WHERE r.donor_name = b.payer_name
      AND r.amount = b.amount
      AND r.receipt_date = b.transaction_date
      AND r.agent_name = 'Suspense'
      AND r.purpose = 'Bank Audit Entry'
  );

-- Step 2: Link receipts back to entries
UPDATE bank_audit_entries b
SET receipt_id = r.id,
    updated_at = NOW()
FROM receipts r
WHERE b.receipt_id IS NULL
  AND b.status = 'unverified'
  AND r.donor_name = b.payer_name
  AND r.amount = b.amount
  AND r.receipt_date = b.transaction_date
  AND r.agent_name = 'Suspense'
  AND r.purpose = 'Bank Audit Entry';
