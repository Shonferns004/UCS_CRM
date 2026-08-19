import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.env') });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false,
});

const sql = `
SELECT 
  fdl.id AS log_id,
  dp.name AS donor_name,
  fdl.amount_collected,
  fdl.accounts_status,
  fdl.created_at::date AS claimed_date,
  w.name AS fro_name,
  r.id AS receipt_id,
  r.receipt_no,
  r.donor_name AS receipt_donor,
  ba.id AS audit_entry_id,
  ba.status AS audit_status,
  ba.match_status,
  fa.status AS assignment_status
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
`;

try {
  const { rows } = await pool.query(sql);
  console.log(JSON.stringify(rows, null, 2));
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await pool.end();
}
