import db from '../config/db.js';

// The dashboard indexes, applied on every boot because migrations are not
// auto-run in this deployment (same rationale as ensureFroDonorLogOperatorSchema
// and its siblings). Reference DDL lives in migrations/184_dashboard_indexes.sql.
//
// Every statement is IF NOT EXISTS and runs on its own try/catch: a fresh or
// partially-provisioned database that is missing one of these tables must still
// boot, and one failed statement must not hide the others. The statements were
// chosen from live pg_stat_statements evidence -- see the header of 184 for the
// measured numbers, and for the list of tables deliberately left un-indexed
// because the planner already seq-scans them correctly.
//
// Plain CREATE INDEX rather than CONCURRENTLY: the largest table here (receipts)
// is 124k rows and builds in seconds, while a failed CONCURRENTLY leaves an
// INVALID index that IF NOT EXISTS then treats as present and skips forever.
// The boot-time lock is a one-time cost per index -- from the second boot on,
// every statement is a no-op catalog lookup.

const INDEXES = [
  // FRO dashboard station scope: was 60.7M seq scans with no worker index.
  `CREATE INDEX IF NOT EXISTS idx_fro_station_assignments_worker
     ON public.fro_station_assignments (fro_worker_id)`,
  // The notice badge every panel boots with: the only index led with notice_id,
  // so `WHERE user_id = $1` read the whole table.
  `CREATE INDEX IF NOT EXISTS idx_notice_seen_user_id
     ON public.notice_seen (user_id)`,
  // HR salary summary + FRO pay strips: the table had idx_scan = 0.
  `CREATE INDEX IF NOT EXISTS idx_salary_history_worker
     ON public.salary_history (worker_id, from_month DESC)`,
  // Accounts NGO Collections: index-only scan of the rows that can contribute
  // to today's / this month's totals, instead of a parallel seq scan of 113MB.
  `CREATE INDEX IF NOT EXISTS idx_receipts_collections
     ON public.receipts (receipt_date, project_id) INCLUDE (amount)
     WHERE receipt_no IS NOT NULL`,
  // Accounts lead list: exact-shape partial so the planner stops walking the
  // full created_at index and discarding ~58k rows per call.
  `CREATE INDEX IF NOT EXISTS idx_fdl_lead_done_fro_created
     ON public.fro_donor_logs (created_at DESC)
     WHERE action = 'disposition' AND disposition_detail = 'lead_done' AND fro_worker_id IS NOT NULL`,
];

export async function ensureDashboardIndexes() {
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
    console.warn(`[ensureDashboardIndexes] ${ok} ok, ${failed.length} skipped:`);
    for (const f of failed) console.warn('  -', f);
  } else {
    console.log(`[ensureDashboardIndexes] ${ok} indexes ready`);
  }
}
