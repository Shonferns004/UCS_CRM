import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

dotenv.config({ path: path.resolve('C:/Users/ADMIN/Desktop/UCS_CRM/backend/.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const run = async () => {
  console.log('=== Suspense receipts Aug 2026 (agent=Suspense, donor_id null, log_id null) by project ===');
  const a = await pool.query(
    `SELECT project_id, COUNT(*) AS cnt FROM receipts
     WHERE agent_name = 'Suspense' AND donor_id IS NULL AND log_id IS NULL
     AND receipt_date >= '2026-08-01' AND receipt_date <= '2026-08-31'
     GROUP BY project_id ORDER BY cnt DESC`
  );
  console.table(a.rows);

  console.log('\n=== ALL unlinked receipts Aug 2026 (donor_id null, log_id null) by agent_name ===');
  const b = await pool.query(
    `SELECT agent_name, project_id, COUNT(*) AS cnt FROM receipts
     WHERE donor_id IS NULL AND log_id IS NULL
     AND receipt_date >= '2026-08-01' AND receipt_date <= '2026-08-31'
     GROUP BY agent_name, project_id ORDER BY cnt DESC LIMIT 40`
  );
  console.table(b.rows);

  console.log('\n=== ngos table ===');
  const c = await pool.query(`SELECT id, name, is_active FROM ngos`);
  console.table(c.rows);

  await pool.end();
};

run().catch((e) => { console.error(e); process.exit(1); });
