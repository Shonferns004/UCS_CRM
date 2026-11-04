import db from '../src/config/db.js';

// !! DESTRUCTIVE LEGACY SCRIPT — DO NOT RUN !!
//
// This script used to reset every stale follow-up to 'pending' and DELETE its
// open fro_scheduled_contacts row. That is the opposite of the current policy:
// a follow-up is a promise to a donor and must survive the month boundary, so
// an October follow-up is still visible in November.
//
// It is kept only as a safe report. It performs no writes. If you need to repair
// data damaged by an earlier rollover, use:
//
//   node scripts/restore-wiped-followups.mjs          (dry run)
//   node scripts/restore-wiped-followups.mjs --apply  (write)
//
// The monthly rollover itself no longer resets statuses (see
// src/services/froMonthlyRollover.js).

const monthStart = new Date();
monthStart.setUTCDate(1);
monthStart.setUTCHours(0, 0, 0, 0);

const { rows } = await db._pool.query(
  `SELECT status, count(*)::int AS n
     FROM public.fro_assignments
    WHERE status IN ('follow_up','scheduled','callback','office_visit_scheduled','program_visit_scheduled','promise_to_pay','payment_pending','will_donate_online','promise_pay_wa_email')
      AND COALESCE(last_contacted_at, updated_at, assigned_at, to_timestamp(0)) < $1
    GROUP BY status ORDER BY n DESC`,
  [monthStart.toISOString()]
);

console.log('Report only — no rows were changed.');
console.log('Open follow-ups older than this month (by status):', JSON.stringify(rows));
process.exit(0);
