-- Migration 074: Fix agent_name on verified receipts
-- When FRO claims a suspense receipt, agent_name stays 'Suspense' instead of
-- the FRO's name. This fixes all historical receipts where the lead was
-- verified by accounts but agent_name was never updated from 'Suspense'.

-- Step 1: Preview (run this first to see what will change)
-- SELECT r.id, r.receipt_no, r.donor_name, r.amount, r.agent_name AS old_agent,
--        w.name AS new_agent
-- FROM receipts r
-- JOIN fro_donor_logs l ON l.id = r.log_id
-- JOIN fro_assignments a ON a.id = l.assignment_id
-- JOIN workers w ON w.id = a.fro_worker_id
-- WHERE r.log_id = l.id
--   AND l.accounts_status = 'verified'
--   AND r.agent_name = 'Suspense'
--   AND w.name IS NOT NULL;

-- Step 2: Update
UPDATE receipts r
SET agent_name = w.name
FROM fro_donor_logs l
JOIN fro_assignments a ON a.id = l.assignment_id
JOIN workers w ON w.id = a.fro_worker_id
WHERE r.log_id = l.id
  AND l.accounts_status = 'verified'
  AND r.agent_name = 'Suspense'
  AND w.name IS NOT NULL
RETURNING r.id, r.receipt_no, r.donor_name, r.amount, r.agent_name;
