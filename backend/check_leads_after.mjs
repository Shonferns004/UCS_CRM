import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.env') });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  const r = await pool.query(`
    SELECT 
      fdl.id AS log_id, dp.name AS donor_name, fdl.amount_collected,
      fdl.accounts_status, fdl.created_at::date AS claimed_date,
      w.name AS fro_name, ng.name AS ngo,
      r.id AS receipt_id, r.receipt_no,
      ba.id AS audit_entry_id, ba.status AS audit_status, ba.match_status
    FROM fro_donor_logs fdl
    JOIN receipts r ON r.log_id = fdl.id
    LEFT JOIN workers w ON w.id = fdl.fro_worker_id
    LEFT JOIN bank_audit_entries ba ON ba.matched_lead_log_id = fdl.id
    LEFT JOIN fro_assignments fa ON fa.id = fdl.assignment_id
    LEFT JOIN donor_profiles dp ON dp.id = fa.donor_id
    LEFT JOIN ngos ng ON ng.id = fa.ngo_id
    WHERE fdl.action = 'disposition'
      AND fdl.disposition_detail = 'lead_done'
      AND fdl.accounts_status = 'pending'
    ORDER BY fdl.created_at DESC;
  `);
  console.log(`Remaining pending claimed leads: ${r.rowCount}`);
  console.log(JSON.stringify(r.rows, null, 2));
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await pool.end();
}
