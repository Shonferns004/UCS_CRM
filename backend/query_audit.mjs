import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.env') });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const sql = `
SELECT
  ba.id,
  ba.transaction_date,
  ba.amount,
  ba.payer_name,
  ba.status,
  ba.match_status,
  ba.match_no,
  ba.receipt_id,
  ba.receipt_no,
  ba.project_id,
  ba.matched_lead_log_id,
  r.donor_name AS receipt_donor,
  r.log_id AS receipt_log_id,
  ng.name AS ngo_name,
  fdl.accounts_status AS lead_status,
  w.name AS claimed_by_fro
FROM bank_audit_entries ba
LEFT JOIN ngos ng ON ng.id = (
  SELECT id FROM ngos WHERE name = 
    CASE ba.project_id WHEN 'bsct' THEN 'BSCT' WHEN 'aflf' THEN 'AFLF' WHEN 'mann' THEN 'MANN' ELSE ba.project_id END
)
LEFT JOIN receipts r ON r.id = ba.receipt_id
LEFT JOIN fro_donor_logs fdl ON fdl.id = ba.matched_lead_log_id
LEFT JOIN workers w ON w.id = fdl.fro_worker_id
ORDER BY ba.transaction_date DESC, ba.id DESC
LIMIT 100;
`;

try {
  const { rows } = await pool.query(sql);
  console.log(JSON.stringify(rows, null, 2));
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await pool.end();
}
