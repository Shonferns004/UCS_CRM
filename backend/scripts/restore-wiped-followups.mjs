import db from '../src/config/db.js';

// Repairs follow-up dates/schedules destroyed by the legacy monthly rollover.
//
// The legacy rollover (mode 'reset_except_preserved') reset every worked lead to
// pending, then cleared next_follow_up and deleted the open
// fro_scheduled_contacts row. The disposition log in
// fro_donor_logs_archive still carries the promised date, so this restores:
//
//   • next_follow_up for follow-up/promise rows that lost it;
//   • the open fro_scheduled_contacts row for scheduled/callback rows.
//
// It deliberately does NOT change any lead status. Re-opening a previous
// month's work is the monthly rollover's job (see
// src/services/froMonthlyRollover.js), and restoring statuses here would undo
// that reset.
//
// Dry run by default. Pass --apply to write. Idempotent.
//
// Usage (from backend/):
//   node scripts/restore-wiped-followups.mjs
//   node scripts/restore-wiped-followups.mjs --apply

const APPLY = process.argv.includes('--apply');

const FOLLOWUP_STATUSES = [
  'scheduled', 'callback', 'follow_up', 'office_visit_scheduled', 'program_visit_scheduled',
];
const PROMISE_STATUSES = [
  'promise_to_pay', 'payment_pending', 'will_donate_online', 'visit_donate', 'whatsapp_sent',
];

const run = async () => {
  const { rows: logs } = await db._pool.query(
    `SELECT month_key, mode, ran_at, finished_at
       FROM public.fro_month_rollover_log
      WHERE mode = 'reset_except_preserved' AND finished_at IS NOT NULL
      ORDER BY month_key DESC
      LIMIT 1`
  );
  const rollover = logs?.[0];
  if (!rollover) {
    console.log('No legacy rollover audit row found — nothing to repair.');
    return;
  }
  const archiveMonth = rollover.month_key;
  const ranAt = new Date(rollover.ran_at);
  const finishedAt = new Date(rollover.finished_at);
  console.log(`Legacy rollover ${archiveMonth}: ${ranAt.toISOString()} → ${finishedAt.toISOString()}`);
  console.log(APPLY ? 'Mode: APPLY' : 'Mode: DRY RUN (pass --apply to write)');

  const window = [ranAt.toISOString(), finishedAt.toISOString()];

  const { rows: preview } = await db._pool.query(
    `SELECT count(*)::int AS n
       FROM public.fro_assignments fa
       JOIN LATERAL (
         SELECT a.scheduled_at
           FROM public.fro_donor_logs_archive a
          WHERE a.assignment_id = fa.id
            AND a.archive_month = $1
            AND a.action = 'disposition'
            AND a.scheduled_at IS NOT NULL
            AND a.scheduled_at >= now() - interval '12 months'
          ORDER BY a.created_at DESC
          LIMIT 1
       ) a ON true
      WHERE fa.status = ANY($4::text[])
        AND fa.rollover_at >= $2 AND fa.rollover_at <= $3
        AND fa.next_follow_up IS NULL
        AND (fa.last_contacted_at IS NULL OR fa.last_contacted_at <= fa.rollover_at)`,
    [archiveMonth, ...window, [...FOLLOWUP_STATUSES, ...PROMISE_STATUSES]]
  );
  console.log('Follow-up/promise rows missing their date:', preview?.[0]?.n ?? 0);

  if (!APPLY) {
    console.log('Dry run complete. Re-run with --apply to write.');
    return;
  }

  await db._pool.query('BEGIN');
  try {
    const { rowCount: datesRestored } = await db._pool.query(
      `UPDATE public.fro_assignments fa
          SET next_follow_up = sub.ist_date
         FROM (
           SELECT DISTINCT ON (a.assignment_id)
                  a.assignment_id,
                  (a.scheduled_at AT TIME ZONE 'Asia/Kolkata')::date AS ist_date
             FROM public.fro_donor_logs_archive a
            WHERE a.archive_month = $1
              AND a.action = 'disposition'
              AND a.scheduled_at IS NOT NULL
              AND a.scheduled_at >= now() - interval '12 months'
            ORDER BY a.assignment_id, a.created_at DESC
         ) sub
        WHERE fa.id = sub.assignment_id
          AND fa.status = ANY($4::text[])
          AND fa.rollover_at >= $2 AND fa.rollover_at <= $3
          AND fa.next_follow_up IS NULL
          AND (fa.last_contacted_at IS NULL OR fa.last_contacted_at <= fa.rollover_at)`,
      [archiveMonth, ...window, [...FOLLOWUP_STATUSES, ...PROMISE_STATUSES]]
    );

    const { rowCount: schedulesRestored } = await db._pool.query(
      `INSERT INTO public.fro_scheduled_contacts
              (assignment_id, scheduled_at, notes, created_by, is_completed)
       SELECT sub.assignment_id, sub.scheduled_at,
              'Restored after the monthly rollover', fa.fro_worker_id, false
         FROM (
           SELECT DISTINCT ON (a.assignment_id)
                  a.assignment_id, a.scheduled_at
             FROM public.fro_donor_logs_archive a
            WHERE a.archive_month = $1
              AND a.action = 'disposition'
              AND a.scheduled_at IS NOT NULL
              AND a.scheduled_at >= now() - interval '12 months'
            ORDER BY a.assignment_id, a.created_at DESC
         ) sub
         JOIN public.fro_assignments fa ON fa.id = sub.assignment_id
        WHERE fa.status = ANY($4::text[])
          AND fa.rollover_at >= $2 AND fa.rollover_at <= $3
          AND (fa.last_contacted_at IS NULL OR fa.last_contacted_at <= fa.rollover_at)
          AND NOT EXISTS (
            SELECT 1 FROM public.fro_scheduled_contacts s
             WHERE s.assignment_id = sub.assignment_id AND s.is_completed = false
          )`,
      [archiveMonth, ...window, FOLLOWUP_STATUSES]
    );

    await db._pool.query('COMMIT');
    console.log(`Restored next_follow_up dates: ${datesRestored}`);
    console.log(`Recreated open schedules: ${schedulesRestored}`);
  } catch (err) {
    await db._pool.query('ROLLBACK');
    throw err;
  }
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Repair failed:', err?.message || err);
    process.exit(1);
  });
