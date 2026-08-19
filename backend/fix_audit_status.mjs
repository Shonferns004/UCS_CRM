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
  // Step 1: Fix bank_audit_entries where match_status='confirmed' but status='unverified'
  const r1 = await pool.query(`
    UPDATE bank_audit_entries
    SET status = 'verified', updated_at = NOW()
    WHERE match_status = 'confirmed' AND status = 'unverified'
    RETURNING id, payer_name, receipt_no, match_no, project_id
  `);
  console.log(`Fixed ${r1.rowCount} bank_audit_entries (confirmed -> verified):`);
  for (const r of r1.rows) {
    console.log(`  id=${r.id} ${r.payer_name} receipt=${r.receipt_no} match=${r.match_no} ngo=${r.project_id}`);
  }

  // Step 2: Fix fro_donor_logs where a claimed lead has a now-verified bank audit entry
  const r2 = await pool.query(`
    UPDATE fro_donor_logs
    SET accounts_status = 'verified', verified_at = NOW()
    WHERE id IN (
      SELECT ba.matched_lead_log_id
      FROM bank_audit_entries ba
      WHERE ba.matched_lead_log_id IS NOT NULL
        AND ba.status = 'verified'
    )
    AND accounts_status = 'pending'
    AND action = 'disposition'
    AND disposition_detail = 'lead_done'
    RETURNING id, accounts_status
  `);
  console.log(`\nFixed ${r2.rowCount} fro_donor_logs (pending -> verified):`);
  for (const r of r2.rows) {
    console.log(`  log_id=${r.id} status=${r.accounts_status}`);
  }
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await pool.end();
}
