import db from '../config/db.js';

// Sevak Library drawn-signature image — adds the storage column on boot via
// ADD COLUMN IF NOT EXISTS (migrations are not auto-run, same rationale as
// ensureSevakRenewalSchema). submitApplication() / updateApplication() write
// signature_photo, so without this column those paths fail outright.

const COLUMN_STEPS = [
  `ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS signature_photo TEXT`,
];

async function tableExists(name) {
  const r = await db._pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [name],
  );
  return r.rows.length > 0;
}

export async function ensureSevakSignatureSchema() {
  if (!(await tableExists('applications'))) return;

  for (const sqlText of COLUMN_STEPS) {
    try {
      await db._pool.query(sqlText);
    } catch (e) {
      // Lost a race with a parallel boot, or the role cannot ALTER. Not fatal:
      // the submit endpoint reports a clear error if the column is missing.
      console.warn('[sevak signature schema] skip:', e?.message || String(e));
    }
  }
}
