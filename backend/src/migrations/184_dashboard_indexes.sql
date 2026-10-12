-- 184: the indexes the dashboards were actually missing.
--
-- Chosen from live evidence (pg_stat_statements + pg_stat_user_indexes on the
-- production database, 2026-10-12), not from guesswork. The big CRM tables were
-- already well indexed -- fro_donor_logs, fro_assignments and receipts each carry
-- a dozen purpose-built indexes that are used millions of times a day. What the
-- stats did show, clearly and repeatedly, were five gaps:
--
--   1. fro_station_assignments: 60.7M sequential scans on
--      `WHERE fro_worker_id = $1` with NO index on that column at all
--      (1.9M ms of CPU, 10.3B tuples read). This is the FRO dashboard's station
--      scope lookup, fired on every request a FRO makes.
--   2. notice_seen: 1.29M scans of `WHERE user_id = $1` while the only index is
--      (notice_id, user_id) -- the leading column is the wrong one, so
--      idx_scan sat at 3 and every call read all 643 rows. This is the notice
--      badge every panel boots with.
--   3. salary_history: idx_scan = 0 on the whole table. 568k calls of
--      `WHERE worker_id IN (...)` and 2.4M full scans (the HR salary summary
--      reads everything by design). No index existed on worker_id.
--   4. receipts: getNgoCollections aggregated all 104,784 receipts to produce
--      three rows, once every ~2 minutes across all Accounts users (25,846
--      calls at 207ms mean). This index lets the date-filtered shape walk an
--      index-only scan instead of a parallel seq scan of a 113MB table.
--   5. fro_donor_logs: getLeadList walks created_at DESC filtering for
--      disposition/lead_done; the existing partial index leads with
--      disposition_detail and accounts_status, so the planner preferred a
--      backward walk of the full created_at index that discarded 58,704 rows
--      per call. This exact-shape partial indexes only the ~2,774 rows that
--      can ever match, in the order they are returned.
--
-- Deliberately NOT indexed, because the planner is already right and an index
-- would only add write cost: ngos (4 rows), holidays (1), events (0), leads
-- (822), notices (14), leaves (187), workers (167), special_incentives (16),
-- fro_monthly_targets (84 rows -- idx_fro_monthly_targets_lookup exists and the
-- planner still seq-scans at 0.02ms, which is the correct plan for a table that
-- fits in one page).
--
-- The 4th index only matters for the deployed code that still lacks the month
-- cutoff in getNgoCollections; the bootstrap applies it regardless so both old
-- and new callers are covered.
--
-- Applied on boot by backend/src/bootstrap/ensureDashboardIndexes.js, which is
-- idempotent, because migrations are not auto-run in this deployment. Plain
-- CREATE INDEX (not CONCURRENTLY): the largest of these, receipts, is 124k rows
-- and builds in seconds, and a failed CONCURRENTLY leaves an invalid index that
-- IF NOT EXISTS would then skip forever.

-- FRO dashboard: station scope per worker.
CREATE INDEX IF NOT EXISTS idx_fro_station_assignments_worker
  ON public.fro_station_assignments (fro_worker_id);

-- Every panel's notice badge: which notices has this user seen.
CREATE INDEX IF NOT EXISTS idx_notice_seen_user_id
  ON public.notice_seen (user_id);

-- HR salary summary and the FRO pay strips look a worker's history up by worker.
CREATE INDEX IF NOT EXISTS idx_salary_history_worker
  ON public.salary_history (worker_id, from_month DESC);

-- Accounts "NGO Collections" cards: today + this month per project, over the
-- rows that can contribute (receipt_no IS NOT NULL), as an index-only scan.
CREATE INDEX IF NOT EXISTS idx_receipts_collections
  ON public.receipts (receipt_date, project_id) INCLUDE (amount)
  WHERE receipt_no IS NOT NULL;

-- Accounts lead list / super-admin leads tab: lead_done dispositions newest first.
CREATE INDEX IF NOT EXISTS idx_fdl_lead_done_fro_created
  ON public.fro_donor_logs (created_at DESC)
  WHERE action = 'disposition' AND disposition_detail = 'lead_done' AND fro_worker_id IS NOT NULL;
