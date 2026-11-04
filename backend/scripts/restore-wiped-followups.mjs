import db from '../src/config/db.js';

// Repairs the damage done by the legacy "reset every worked lead to pending"
// monthly rollover, using the audit row the rollover itself wrote.
//
//   • Restores each lead's pre-rollover status from rollover_from_status, so a
//     used lead goes back to History / Follow Ups / Overdue instead of sitting
//     in My Leads as "fresh pending".
//   • Restores next_follow_up and the open fro_scheduled_contacts row from the
//     archived disposition log, so last month's follow-ups are visible again.
//
// Dry run by default. Pass --apply to write. Idempotent: a restored row is no
// longer status='pending', so a second run skips it.
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
  const { month_key: archiveMonth } = rollover;
  const ranAt = new Date(rollover.ran_at);
  const finishedAt = new Date(rollover.finished_at);
  console.log(`Legacy rollover ${archiveMonth}: ${ranAt.toISOString()} → ${finishedAt.toISOString()}`);
  console.log(APPLY ? 'Mode: APPLY' : 'Mode: DRY RUN (pass --apply to write)');

  const window = [ranAt.toISOString(), finishedAt.toISOString()];

  const { rows: preview } = await db._pool.query(
    `SELECT rollover_from_status AS prev_status, count(*)::int AS n
       FROM public.fro_assignments
      WHERE status = 'pending'
        AND rollover_at >= $1 AND rollover_at <= $2
        AND rollover_from_status IS NOT NULL
        AND rollover_from_status NOT IN ('pending','reassigned','dnd')
        AND (last_contacted_at IS NULL OR last_contacted_at <= rollover_at)
      GROUP BY 1 ORDER BY 2 DESC`,
    window
  );
  console.log('Statuses that would be restored:', JSON.stringify(preview, null, 1));

  const { rows: schedulePreview } = await db._pool.query(
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
      WHERE fa.status = 'pending'
        AND fa.rollover_at >= $2 AND fa.rollover_at <= $3
        AND fa.rollover_from_status = ANY($4::text[])
        AND (fa.last_contacted_at IS NULL OR fa.last_contacted_at <= fa.rollover_at)`,
    [archiveMonth, ...window, [...FOLLOWUP_STATUSES, ...PROMISE_STATUSES]]
  );
  console.log('Follow-up/promise rows with an archived date:', schedulePreview?.[0]?.n ?? 0);

  if (!APPLY) {
    console.log('Dry run complete. Re-run with --apply to write.');
    return;
  }

  await db._pool.query('BEGIN');
  try {
    // 1. Put the status back. rollover_from_status is the exact value the legacy
    //    reset replaced, so this is a faithful undo (not a guess).
    const { rowCount: restored } = await db._pool.query(
      `UPDATE public.fro_assignments
          SET status = rollover_from_status
        WHERE status = 'pending'
          AND rollover_at >= $1 AND rollover_at <= $2
          AND rollover_from_status IS NOT NULL
          AND rollover_from_status NOT IN ('pending','reassigned','dnd')
          AND (last_contacted_at IS NULL OR last_contacted_at <= rollover_at)`,
      window
    );

    // 2. Put next_follow_up back from the archived disposition that created it.
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

    // 3. Recreate the open scheduled-contact row for scheduled/callback leads
    //    when one is missing. This is what makes them reappear on the Follow Ups
    //    and Overdue tabs (and excludes them from the read-time recovery).
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
    console.log(`Restored statuses: ${restored}`);
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
