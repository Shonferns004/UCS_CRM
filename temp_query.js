import { createClient } from '@supabase/supabase-js';

const db = createClient(
  'https://cv8asue2a57e.ap-south-1.aws.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2OGFzdWUyYTU3ZS5hcC1zb3V0aC0xLmF3cy5zdXBhYmFzZS5jb20iLCJyb2xlIjoiYW5vbiIsImlhdCI6MTcyMjU4MDIzNSwiZXhwIjoyMDM4MTU2MjM1fQ.placeholder'
);

async function main() {
  const { data, error } = await db.rpc('exec_sql', { query: `
    SELECT 
      fdl.id AS log_id,
      dp.name AS donor_name,
      fdl.amount_collected,
      fdl.accounts_status,
      fdl.created_at::date AS claimed_date,
      w.name AS fro_name,
      r.id AS receipt_id,
      r.receipt_no,
      ba.id AS audit_entry_id,
      ba.status AS audit_status,
      ba.match_status
    FROM fro_donor_logs fdl
    JOIN receipts r ON r.log_id = fdl.id
    LEFT JOIN workers w ON w.id = fdl.fro_worker_id
    LEFT JOIN bank_audit_entries ba ON ba.matched_lead_log_id = fdl.id
    LEFT JOIN fro_assignments fa ON fa.id = fdl.assignment_id
    LEFT JOIN donor_profiles dp ON dp.id = fa.donor_id
    WHERE fdl.action = 'disposition'
      AND fdl.disposition_detail = 'lead_done'
      AND fdl.accounts_status = 'pending'
    ORDER BY fdl.created_at DESC;
  ` });
  
  if (error) {
    console.error('RPC error:', error);
    process.exit(1);
  }
  console.log(JSON.stringify(data, null, 2));
}

main();
