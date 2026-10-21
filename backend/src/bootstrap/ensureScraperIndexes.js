import db from '../config/db.js';

// The scraper dedup indexes, applied on every boot because migrations are not
// auto-run in this deployment (same rationale as ensureDashboardIndexes and its
// siblings). Reference DDL lives in backend/migrations/195_scraper_indexes.sql.
//
// Without these, every transaction the device app uploads costs a sequential
// scan of bank_audit_entries: the "is this UPI ref already in the DB?" check
// and the device's known-refs preload both had no index on payment_id. A batch
// of N rows was N full table scans, each holding one of the pool's 5
// connections while the rest of the panels waited.
//
// Every statement is IF NOT EXISTS and runs on its own try/catch: a fresh or
// partially-provisioned database that is missing scraper_runs /
// scraper_run_entries must still boot, and one failed statement must not hide
// the others. Plain CREATE INDEX rather than CONCURRENTLY: these tables are
// small enough to build in seconds, and a failed CONCURRENTLY leaves an
// INVALID index that IF NOT EXISTS then treats as present and skips forever.

const INDEXES = [
  // The dedup check: one indexed lookup per ref instead of a table scan.
  `CREATE INDEX IF NOT EXISTS idx_bank_audit_entries_payment_id
     ON public.bank_audit_entries (payment_id)
     WHERE payment_id IS NOT NULL`,
  // known-refs: project-scoped, so project_id must lead. The device waits on
  // this at every run start before it can skip already-imported rows on screen.
  `CREATE INDEX IF NOT EXISTS idx_bank_audit_entries_project_payment
     ON public.bank_audit_entries (project_id, payment_id)
     WHERE payment_id IS NOT NULL`,
  // The no-ref fallback (amount + date + payer when the UPI ref was unreadable).
  `CREATE INDEX IF NOT EXISTS idx_bank_audit_entries_fingerprint
     ON public.bank_audit_entries (project_id, transaction_date, amount, payer_name)
     WHERE payment_id IS NULL`,
  // One run's entries, newest first (run detail view + per-run logging).
  `CREATE INDEX IF NOT EXISTS idx_scraper_run_entries_run
     ON public.scraper_run_entries (run_id, created_at DESC)`,
];

export async function ensureScraperIndexes() {
  let ok = 0;
  const failed = [];
  for (const sql of INDEXES) {
    try {
      await db._pool.query(sql);
      ok += 1;
    } catch (e) {
      // Usually "relation does not exist" on a fresh database, or a lost race
      // with a parallel boot that created it first. Either way: log and move on.
      const name = sql.match(/IF NOT EXISTS (\S+)/)?.[1] || '(unknown)';
      failed.push(`${name}: ${e?.message || String(e)}`);
    }
  }
  if (failed.length) {
    console.warn(`[ensureScraperIndexes] ${ok} ok, ${failed.length} skipped:`);
    for (const f of failed) console.warn('  -', f);
  } else {
    console.log(`[ensureScraperIndexes] ${ok} indexes ready`);
  }
}
