# Dashboard DB indexing — all panels

## Context (why)

Redis/Upstash L2 is **intentionally limited** (cost policy in `backend/src/utils/ttlCache.js:5-18`); only ngo-admin dashboard/stations/station-stats, FRO My Leads and one accounts receipt total are cached at all, and most panels re-query on every mount. The real, panel-wide win available now is **database indexes**: the hot tables (`receipts`, `fro_donor_logs`, `attendance`, `leads`, `workers`, `leaves`, `holidays`, `notices`, `events`, `support_tickets`, `attendance_corrections`, `bank_audit_entries`, `fro_assignments`, `fro_scheduled_contacts`, `fro_live_status`, `salary_history`, `beneficiaries`, `sim_cards`) have **no indexes declared anywhere in this repo** — their `CREATE TABLE` was done outside git (Supabase), so every dashboard query is a seq scan + sort.

Scope agreed with user: **DB indexes only** (no caching changes), applied by **bootstrap on boot** (repo's `ensure*Schema.js` convention), covering **all panels**.

## Step 0 — Inspect live indexes first (read-only, required)

`backend/.env` holds the Supabase connection. Before writing DDL, run a read-only query to see which of these indexes already exist out-of-band (IF NOT EXISTS only checks the *name*, so duplicates under a different name would double-write cost):

```sql
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename IN
('receipts','fro_donor_logs','fro_assignments','fro_scheduled_contacts','fro_live_status',
 'attendance','leaves','holidays','workers','salary_history','leads','notices','events',
 'support_tickets','ticket_replies','attendance_corrections','bank_audit_entries',
 'beneficiaries','sim_cards','event_head_events')
ORDER BY tablename, indexname;
```

Drop from the list any index already present with an equivalent definition (keep the existing name; do not create ours).

## Files

| File | Change |
|---|---|
| `backend/src/bootstrap/ensureDashboardIndexes.js` | **new** — the DDL, one statement per index, per-statement try/catch |
| `backend/src/migrations/184_dashboard_indexes.sql` | **new** — same DDL as a reference file (repo convention: `NNN_*.sql` + bootstrap; see `182_fro_donor_logs_operator_id.sql` header) |
| `backend/src/index.js` | import + call `ensureDashboardIndexes()` in the boot block (after `ensureFroDonorLogOperatorSchema()` at :1204), same `.catch(console.error)` shape as siblings |

## Bootstrap shape (mirrors `ensureFroDonorLogOperatorSchema.js`)

```js
const INDEXES = [
  { name: 'idx_receipts_collections',  sql: 'CREATE INDEX IF NOT EXISTS idx_receipts_collections ON receipts (receipt_date, project_id) INCLUDE (amount) WHERE receipt_no IS NOT NULL' },
  // ...
];
export async function ensureDashboardIndexes() {
  const created = []; const failed = [];
  for (const idx of INDEXES) {
    try { await db._pool.query(idx.sql); created.push(idx.name); }
    catch (e) { failed.push(`${idx.name}: ${e?.message}`); }   // never block boot
  }
  console.log(`[ensureDashboardIndexes] ok=${created.length} failed=${failed.length}`);
  for (const f of failed) console.warn('[ensureDashboardIndexes]', f);
}
```

Rules: plain `CREATE INDEX IF NOT EXISTS` (no `CONCURRENTLY` — a failed CONCURRENTLY leaves an *invalid* index that `IF NOT EXISTS` then skips forever); whole function wrapped in try/catch so a DB without these tables (fresh env) still boots; no transaction wrapper.

## Index list (each tied to the query it fixes)

**accounts**
1. `receipts (receipt_date, project_id) INCLUDE (amount) WHERE receipt_no IS NOT NULL` — `getNgoCollections` seq-scans all receipts on every Lead&Audit load (`accountsController.js:3957-3969`); also covers the beneficiaries overview `SUM(amount)` (`beneficiaryModel.js:373`).
2. `receipts (receipt_date, project_id) INCLUDE (amount) WHERE donor_id IS NULL AND log_id IS NULL` — suspense/unlinked query (`accountsController.js:3936-3948`) + bank-audit suspense list (`bankAuditModel.js:30-36`).
3. `receipts (receipt_date DESC)` — ORDER BY paths (`bankAuditModel.js:270`, `getReceiptList` totals).

**fro**
4. `fro_donor_logs (created_at DESC) WHERE action='disposition' AND disposition_detail='lead_done' AND fro_worker_id IS NOT NULL` — `getLeadList` (`accountsController.js:116-138`) and super-admin `/accounts/leads`; today it scans the largest table in the app.
5. `fro_donor_logs (fro_worker_id, created_at DESC)` — per-FRO aggregations (`froDonorLogModel.js:296,369,481,545,619`) and `getLiveStatuses` `.in('fro_worker_id', …)` (`froController.js:6126-6129`).
6. `fro_donor_logs (accounts_status, verified_at)` — verified-collection aggregates in the super-admin dashboard.
7. `fro_assignments (ngo_id, assigned_at DESC) WHERE station IS NOT NULL AND status <> 'reassigned'` — `getStations` (`ngoAdminController.js:1823-1829`) + station-stats; runs uncached on NGO-admin poll.
8. `fro_assignments (station, ngo_id)` — join path used by `fro_assignments!inner(station,…)` (`froController.js:4749`).
9. `fro_scheduled_contacts (scheduled_at) WHERE is_completed = false` — `getFollowUps` (`froController.js:4746-4754`).
10. `fro_live_status (updated_at DESC)` — `getLiveStatuses` full-table sort (`froController.js:6087-6090`); only a partial `disposition_due_at` index exists today (`172_fro_idle_reconcile_index.sql`).

**hr + super-admin**
11. `attendance (date DESC, worker_id)` — `getAllAttendance` (`attendanceModel.js:133-137`), super-admin period aggregates (`dashboardController.js:225-254` region), and the `date = today AND worker_id = ANY(…)` lookup (`froController.js:6121-6124`).
12. `leaves (applied_at DESC)` — `getAllLeaves` (`leaveModel.js:23-27`).
13. `leaves (status) WHERE status = 'pending'` — `getPendingLeaves` (`leaveModel.js:32-37`) + super-admin pending count.
14. `holidays (date)` — `getAllHolidays` (`holidayModel.js:13-17`).
15. `workers (created_at DESC)` — `getAllWorkers` (`workerModel.js:123-125`) + salary summary (`salaryModel.js:161-165`).
16. `salary_history (from_month DESC)` — salary summary (`salaryModel.js:168-171`).
17. `attendance_corrections (status)` — pending badge counted on HR boot (`attendanceCorrectionModel.js:98-102`).
18. `attendance_corrections (created_at DESC)` — `getAllTickets` (`attendanceCorrectionModel.js:73-77`).

**recruiter**
19. `leads (created_at DESC)` — `getAllLeads` / `getLeadsDashboard` full-table reads on every mount/poll (`leadModel.js:113-116,184-187`).
20. `leads (recruiter_id, created_at DESC)` — recruiter-filtered lists.

**super-admin / event-head / dev-panel / sim-card / notices**
21. `notices (created_at DESC) WHERE is_active` — `getAllNotices` (`noticeModel.js:61-66`), loaded by 5+ panel homes.
22. `events (event_date) WHERE is_active` — super-admin upcoming-events query in `dashboardController` (verify exact predicate while implementing).
23. `event_head_events (created_at DESC)` — `eventHeadModel.js:22`.
24. `support_tickets (created_at DESC)` — `listTickets` (`ticketController.js:8-11`) → dev-panel dashboard.
25. `support_tickets (status, created_at DESC)` — status-filtered lists.
26. `ticket_replies (ticket_id)` — per-ticket reply counts (`ticketController.js:29-33`).
27. `bank_audit_entries (transaction_date DESC)` — bank-audit entries list (`bankAuditModel.js:270-274`).
28. `sim_cards (created_at DESC)` — `simCardModel.js:13`.

Out of scope (note in the migration header): sevak-library lives on a **separate** Supabase project (`sevakLibrary/config/supabase.js`) and needs its own SQL; whatsapp/chat tables already indexed by `151_chat.sql`/`152_chat_notices.sql`.

## Verification

1. `cd backend && npm test` (node --test) — ensure nothing imports/breaks.
2. Boot locally against prod DB (read path only): confirm log line `[ensureDashboardIndexes] ok=… failed=0` and re-run the Step 0 `pg_indexes` query to confirm all 28 exist.
3. Timing check before/after on the two worst endpoints: `GET /api/accounts/collections` and `GET /api/fro/leads`-equivalent (auth required — use a dev token), or ask Postgres directly: `EXPLAIN (ANALYZE, BUFFERS)` on the `getNgoCollections` SQL and confirm `Seq Scan` → `Index Only Scan`.
4. Commit, push, PR to upstream; deploy is automatic on merge (upstream Actions → EC2; health check at `api.beingsevak.org/health`).

## Risks

- **One-time write lock**: first boot builds ~28 indexes; `receipts` and `fro_donor_logs` are the big ones (seconds to a couple of minutes). Prefer a low-traffic window. If you want zero risk, pre-create those two manually with `CREATE INDEX CONCURRENTLY` in the Supabase SQL editor *before* merging — the bootstrap's `IF NOT EXISTS` then no-ops.
- **Name-only dedup**: if prod already has equivalent indexes under other names, ours add write overhead — hence Step 0 is mandatory.
- **Fresh/dev DBs** missing a table: per-statement catch logs the failure and boot continues.
