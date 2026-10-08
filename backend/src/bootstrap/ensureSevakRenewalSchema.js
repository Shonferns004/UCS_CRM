import db from '../config/db.js';

// Sevak Library renewal tracking — repairs the applications table on boot via
// ADD COLUMN IF NOT EXISTS (migrations are not auto-run, same rationale as
// ensureTicketSchema). renewApplication() writes renewal_count / renewal_fees /
// last_renewed_at in a single UPDATE, so without these columns the renew
// endpoint would fail outright.

const COLUMN_STEPS = [
  `ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS renewal_soon_sent  BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS renewal_count    INT NOT NULL DEFAULT 0`,
  `ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS renewal_fees     NUMERIC NOT NULL DEFAULT 0`,
  `ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS last_renewed_at  DATE`,
  `ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS renewal_payments JSONB NOT NULL DEFAULT '[]'`,
];

async function tableExists(name) {
  const r = await db._pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [name],
  );
  return r.rows.length > 0;
}

export async function ensureSevakRenewalSchema() {
  if (!(await tableExists('applications'))) return;

  for (const sqlText of COLUMN_STEPS) {
    try {
      await db._pool.query(sqlText);
    } catch (e) {
      // Lost a race with a parallel boot, or the role cannot ALTER. Not fatal:
      // the renew endpoint reports a clear error if the column is missing.
      console.warn('[sevak renewal schema] skip:', e?.message || String(e));
    }
  }
}
