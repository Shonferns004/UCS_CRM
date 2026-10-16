# Employee Overview — Metric Dictionary (Phase 0)

Every KPI on Accounts → Operations → Employee Detail → Overview is defined
here. If a number on the page cannot be traced to a rule below, it is a bug.

Scope: Accounts mode only. HR panel unchanged. Read-only analytics — Overview
never writes receipts, targets, attendance, payroll, or employee records.

## Timezone and dates

- All date bounds are **IST calendar days** (`YYYY-MM-DD`).
- `receipts.receipt_date` is a DATE column holding the IST day money was taken
  in. Every collection bucket uses this field — same day the FRO "Collected"
  card uses, so the card and Overview always agree.
- Financial year is **April–March** (org convention).
- Dates before the joining date (`workers.created_at`, the DOJ everywhere in
  payroll) are excluded from every metric.

## Collection

- **Source of truth:** `getWorkerCollectionReceipts` in
  `backend/src/models/froDonorLogModel.js:261` — the single attribution module
  (`services/froCollectionMatch.js`).
- **Attribution rule (verified, not assumed):**
  1. **Name first.** Receipts whose `agent_name` matches the worker's canonical
     name, curated aliases (`worker_aliases`), or the work-as session label —
     via exact `lower(btrim(agent_name))` equality with LIKE wildcards escaped.
     Category labels (`suspense`, `pg`, `library`, `na`) are never a person.
  2. **`receipts.log_id → fro_donor_logs.fro_worker_id` is a fallback only**,
     consulted solely when the name resolves to nobody. A name that resolves to
     ANOTHER worker blocks the fallback (prevents double-crediting).
  3. Deduplicated by receipt id, then by payment identity
     (`receipt_no|donor_id|amount|receipt_date|payment_id`). Amount ≤ 0 dropped.
- **Date field:** `receipt_date` (IST day), never created_at / claim time.
- **Void rule:** the worker-facing collection path does **not** filter
  `voided_at` — consistent with the FRO dashboard card and NGO reports, which
  also do not. (Some accounts list endpoints filter voids; those answer a
  different question.) Overview matches the FRO card by design.
- **Dedup invariant:** one receipt counted exactly once, across both windows.
- Aggregation is server-side; the browser never sums raw receipts.

## Target achievement

- **Resolver:** `services/froMonthlyTarget.js resolveMonthlyTarget` — the one
  precedence rule: month-M manual row (`fro_monthly_targets`) beats auto;
  auto (salary × 1 / 2.5 / 3 for months 1–3 of tenure) beats a stale earlier
  row; month 4+ carries the latest earlier row forward.
- Granularity is **month-only**. A range covering multiple months uses
  `sum(monthly targets over months in range)`; a Lifetime/custom-range figure is
  labelled as a sum of monthly targets.
- `achievement_pct = collection / target * 100` only when target > 0;
  otherwise **"No target"** (never 0%, never divide-by-zero).
- `remaining = max(target − collection, 0)`; surplus shown separately when
  overachieved.
- Historical months use the target that applied in that month (manual row or
  carried-forward per the resolver), never today's target retroactively.

## Receipts count

- Count of receipts after the same attribution + dedupe as Collection, with
  `amount > 0`, within the date window. Equals rows summed for the collection
  total (reconciliation invariant).

## Attendance

- **Source:** `attendance` table via `models/attendanceModel.js
  getMonthlyAttendance` + approved leaves (same as the Attendance tab).
- Statuses are the org's existing set (present/absent/leave/half-day/late per
  existing records). No reinterpretation.
- `attendance_pct = present-ish days / eligible days` where eligible days are
  in-range days from DOJ onward, minus approved leave days — matching the
  Attendance tab's denominator.
- Pre-joining days, Sundays, and holidays are never counted as zero-performance
  days.

## Working time / idle time

- Deferred to Phase 2+. Source will be `fro_time_sessions` via
  `services/froTimeReport.js` — existing rules (Work As, late login, overnight
  gaps, logout) untouched.

## Tenure

- From `workers.created_at` (DOJ) to range end (or today). Active employment =
  `employment_status` not in (`offboarded`, `absconded`, `terminated`).

## Profit / contribution

- Shown on the Overview tab (Activity card) as
  **"Collection minus salary — partial contribution"** = collection in range −
  daily-prorated salary from `salary_history` for the same range.
- There is no per-worker cost ledger; salary is the only cost tracked, so the
  figure is explicitly labelled partial and never called "Profit".
- Omitted entirely (not zero) if either term cannot be computed.

## Activity timeline

- Union of dated rows only: `workers.created_at` (joined), `salary_history`
  (`from_month`), `leaves.applied_at`, `worker_loans.applied_at`,
  `attendance_corrections.created_at`, `profile_update_requests.created_at`,
  and resolved monthly targets (dated to month start).
- **Not an audit trail** — `workers` field-level edits are not versioned; the
  API returns `history_unavailable` and the UI prints it verbatim.
- Events are range-filtered by their source date, newest first, capped at 200
  (`truncated` flag set when exceeded).

## Monthly performance tables (imported history)

- **Monthly Performance** (table) is receipts-driven over a 12-month window
  ending at the selected range end: collection/receipts come from the
  heatmap payload only. Its **Target** column is the configured live target
  when one exists for that month, otherwise the target imported for that
  (worker, month) from History Import. Its **Salary** column is the imported
  monthly salary from the same workbook row; months the import does not cover
  fall back to the `salary_history` record effective for that month (typically
  from the employee's joining date), resolved server-side as
  `salary_by_month` on the heatmap payload. Salary-history months are compared
  in IST (records are stored as IST midnights in UTC) and the latest effective
  record wins. No salary anywhere = "—".
- The imported months themselves (collection/target/salary + source sheet)
  are listed read-only in the Salary tab's Salary History card.

## Chart date semantics

- Daily / weekly / monthly buckets all use `receipt_date` (IST day).
- Cumulative target line = running sum of resolved monthly targets by month,
  prorated only if/when a working-day policy is approved; until then the line
  is the flat monthly target for the month being displayed.

## Reconciliation

- KPI totals must equal the FRO dashboard "Collected" card for the same worker
  and month, and the same figures in NGO reports, because they call the same
  model function. Any discrepancy is a bug in the caller, not in the metric.
