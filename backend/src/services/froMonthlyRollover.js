import db from '../config/db.js';
import { istMonthKey, istMonthStartUtc } from '../utils/ist.js';
import { makeNonOverlap } from '../utils/noOverlap.js';
import cron from 'node-cron';

// ─── Monthly FRO lead rollover ───────────────────────────────────────────────
// Every billing month the FRO work cycle restarts: leads worked last month go
// back to 'pending' so each FRO gets a fresh, complete list rather than a
// shrinking remainder. Without this, an FRO's list only ever loses leads.
//
// What survives the rollover (PRESERVED_STATUSES):
//   • pending / reassigned        — nothing to do.
//   • dnd                         — the ONLY way into donor_dnd (migration 165)
//                                   is the DND option in the disposition
//                                   dropdown. This job never writes DND marks.
//                                   donor_dnd is what suppresses a donor, so the
//                                   assignment's own status is irrelevant to
//                                   visibility once the mark exists.
//   • donation_collected / lead_done / done
//                                 — completed money, handled by getMyDonors'
//                                   staleDoneStatus and terminal dispositions.
//   • scheduled / callback / follow_up
//                                 — unfulfilled call promises.
//   • promise_to_pay / payment_pending / will_donate_online / visit_donate /
//     whatsapp_sent / already_donated
//                                 — commitments getFroPromises reads straight off
//                                   fro_assignments.status; resetting them would
//                                   silently empty the Promise tab.
//   • not_interested / not_interested_now
//                                 — a refusal is NOT permanent, but it must not
//                                   come back the next day either. These are
//                                   excluded from the monthly bulk reset and
//                                   instead reset by a rolling cooldown
//                                   (NOT_INTERESTED_COOLDOWN_DAYS after the
//                                   refusal call). A donor who truly never wants
//                                   contact must be marked DND in the dropdown —
//                                   that is the only permanent stop.
//
// Everything else (ringing, busy, unreachable, wrong_number, …) resets to
// 'pending'. That is the intended fresh-month behaviour. Resets stamp
// rollover_from_status/rollover_at so the FRO can still see the previous status
// and that it was a month-boundary reset (migration 167).
//
// Scope note: DND is per (donor, ngo). A donor marked DND at one NGO stays
// callable at an unrelated NGO; that is the approved behaviour.
const PRESERVED_STATUSES = [
  'pending', 'reassigned', 'dnd', 'donation_collected', 'lead_done', 'done',
  'scheduled', 'callback', 'follow_up',
  'promise_to_pay', 'payment_pending', 'will_donate_online', 'visit_donate',
  'whatsapp_sent', 'already_donated', 'not_interested', 'not_interested_now',
];

// Written to the audit row. The single supported behaviour now.
export const ROLLOVER_MODE = 'reset_except_preserved';

// A refusal resets on its own rolling clock, not on the 1st: this many days after
// the last refusal call the lead goes back to pending and is callable again. Kept
// out of the monthly claim so it fires on the exact day it is due, even on a day
// when the month's bulk reset is already finished.
export const NOT_INTERESTED_STATUSES = ['not_interested', 'not_interested_now'];
export const NOT_INTERESTED_COOLDOWN_DAYS = 60;

// Batched because this touches ~100k rows. A single UPDATE of that size on the
// 2-core RDS box holds locks long enough to stall the FRO app and can exceed
// statement_timeout. 5k rows per short statement keeps each batch to
// milliseconds; the daily schedule resumes from where it stopped after a crash.
const BATCH_SIZE = 5000;

/**
 * Decide whether this run should proceed.
 *
 * Creates the month's audit row if absent (ON CONFLICT DO NOTHING) and reads it
 * back; a run proceeds when the month has no finished_at yet. Two instances
 * booting together can both proceed — this is NOT a hard mutex. That is safe
 * because the work is idempotent: a reset row becomes 'pending' (a preserved
 * status), so duplicate runs cannot corrupt anything, they only repeat work and
 * may double-count totals.
 *
 * @returns {{proceed: boolean, row: object|null}}
 */
async function claimMonth(monthKey, mode) {
  await db._pool.query(
    `INSERT INTO public.fro_month_rollover_log (month_key, mode)
     VALUES ($1, $2)
     ON CONFLICT (month_key) DO NOTHING`,
    [monthKey, mode]
  );

  const { rows } = await db._pool.query(
    `SELECT month_key, mode, rows_reset, rows_dnd, finished_at
       FROM public.fro_month_rollover_log
      WHERE month_key = $1`,
    [monthKey]
  );
  const row = rows?.[0] || null;
  return { proceed: !!row && row.finished_at === null, row };
}

/**
 * Record the outcome. Called with running totals as batches complete so an
 * interrupted run still leaves an auditable trail.
 */
async function recordProgress(monthKey, { rowsReset, detail, finished }) {
  await db._pool.query(
    `UPDATE public.fro_month_rollover_log
        SET rows_reset = $2, detail = $3,
            finished_at = CASE WHEN $4 THEN now() ELSE finished_at END
      WHERE month_key = $1`,
    [monthKey, rowsReset, JSON.stringify(detail || {}), !!finished]
  );
}

/**
 * Rolling cooldown for refusals.
 *
 * not_interested / not_interested_now are excluded from the monthly bulk reset;
 * this pass is built to run daily, independent of the month claim, and returns a
 * refused lead to 'pending' once NOT_INTERESTED_COOLDOWN_DAYS have passed since
 * the refusal call. That gives a rolling schedule (a lead comes back on its due
 * day, not only on the 1st) and rebadges it as a rollover reset so the FRO sees
 * "was not_interested" instead of a bare pending.
 *
 * Idempotent: a reset row is 'pending' and drops out of the WHERE clause, so a
 * same-day re-run does nothing.
 *
 * @returns {Promise<number>} rows reset to pending.
 */
async function runNotInterestedCooldown() {
  let cursor = 0;
  let rowsReset = 0;
  for (;;) {
    const batch = await db._pool.query(
      `SELECT id FROM public.fro_assignments
        WHERE id > $1
          AND status = ANY($2::text[])
          AND COALESCE(last_contacted_at, updated_at, assigned_at, to_timestamp(0))
              <= now() - make_interval(days => $3)
        ORDER BY id
        LIMIT $4`,
      [cursor, NOT_INTERESTED_STATUSES, NOT_INTERESTED_COOLDOWN_DAYS, BATCH_SIZE]
    );
    const rows = batch.rows || [];
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    const ids = rows.map(r => r.id);
    await db._pool.query(
      `UPDATE public.fro_assignments
          SET status = 'pending', hidden_until = NULL, next_follow_up = NULL,
              rollover_from_status = status, rollover_at = now()
        WHERE id = ANY($1::int[])`,
      [ids]
    );
    rowsReset += ids.length;
  }
  return rowsReset;
}

/**
 * Run the monthly rollover.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.force]     Run even if the month is already finished
 *                                   (re-runs are idempotent; use for recovery).
 * @param {string}  [opts.monthKey]  Override the month (testing / backfill).
 * @param {string}  [opts.mode]      Override ROLLOVER_MODE for a single run.
 * @returns {Promise<{skipped?:boolean, monthKey:string, mode:string,
 *                    rowsReset:number, cooldownReset:number, detail:object}>}
 */
export async function runMonthlyRollover(opts = {}) {
  const monthKey = opts.monthKey || istMonthKey();
  const mode = opts.mode || ROLLOVER_MODE;
  // Start of the current IST billing month. Only leads last active before this
  // instant are eligible, i.e. work from a previous month.
  //
  // The activity stamp is COALESCE(last_contacted_at, updated_at, assigned_at),
  // NOT updated_at alone. fro_assignments has no trigger maintaining updated_at
  // and the FRO disposition path only writes last_contacted_at, so updated_at
  // lags by days or weeks on ~20k rows; using it alone wrongly reset 5,420 leads
  // that had already been worked in the current month. last_contacted_at is
  // written on every contact, so it is the correct "last worked" stamp; the
  // fallbacks cover rows never contacted.
  //
  // This predicate is what makes the job safe to run daily and safe to re-run:
  // a row reset now becomes 'pending' (preserved), so it is excluded for the
  // rest of the month regardless of its activity stamp.
  const monthStart = opts.monthStart || istMonthStartUtc();

  // Refusal cooldown first and unconditional: it is a rolling daily schedule,
  // not part of the monthly claim below, so a refusal returns on its due day even
  // after the month's bulk reset is already finished.
  const cooldownReset = await runNotInterestedCooldown();

  if (!opts.force) {
    const { proceed, row } = await claimMonth(monthKey, mode);
    if (!proceed) {
      console.log(`FRO monthly rollover ${monthKey}: already finished, skipping.`, JSON.stringify(row || {}));
      if (cooldownReset) console.log(`FRO refusal cooldown: reset ${cooldownReset} not_interested leads to pending`);
      return { skipped: true, monthKey, mode, rowsReset: 0, cooldownReset, detail: {} };
    }
  }

  const preserved = new Set(PRESERVED_STATUSES);
  const detail = { monthStart: monthStart.toISOString() };
  let rowsReset = 0;

  try {
    // Walk the table in id order so batching is a simple cursor rather than a
    // repeated OFFSET scan (which gets slower each page on a 200k-row table).
    let cursor = 0;
    for (;;) {
      const batch = await db._pool.query(
        `SELECT id, donor_id, ngo_id, station, status, assigned_at, updated_at, last_contacted_at
           FROM public.fro_assignments
          WHERE id > $1
            AND status <> ALL($2::text[])
            AND COALESCE(last_contacted_at, updated_at, assigned_at, to_timestamp(0)) < $3
          ORDER BY id
          LIMIT $4`,
        [cursor, PRESERVED_STATUSES, monthStart, BATCH_SIZE]
      );
      const rows = batch.rows || [];
      if (rows.length === 0) break;
      cursor = rows[rows.length - 1].id;

      const resetRows = rows.filter(r => !preserved.has(r.status));
      if (resetRows.length) {
        const resetIds = resetRows.map(r => r.id);
        // Clear hidden_until alongside the status. Leaving it behind would keep
        // a freshly reset lead hidden until its old park date expired — exactly
        // the "my allotment says N but I can only see M" problem.
        //
        // rollover_from_status = status reads the OLD value: in a single UPDATE
        // every right-hand column reference sees the pre-update row, so the reset
        // records what the lead was before this statement flipped it to pending.
        // The FRO then sees "was ringing, monthly reset" instead of a bare pending.
        await db._pool.query(
          `UPDATE public.fro_assignments
              SET status = 'pending', hidden_until = NULL, next_follow_up = NULL,
                  rollover_from_status = status, rollover_at = now()
            WHERE id = ANY($1::int[])`,
          [resetIds]
        );
        rowsReset += resetIds.length;
        for (const r of resetRows) detail[`reset:${r.status}`] = (detail[`reset:${r.status}`] || 0) + 1;
      }

      await recordProgress(monthKey, { rowsReset, detail, finished: false });
    }

    await recordProgress(monthKey, { rowsReset, detail, finished: true });
    console.log(`FRO monthly rollover ${monthKey} (${mode}): reset ${rowsReset}; refusal cooldown reset ${cooldownReset}`);
    return { monthKey, mode, rowsReset, cooldownReset, detail };
  } catch (err) {
    // Leave the claim in place with partial totals. Clearing it would let a
    // retry re-scan rows the first pass already handled.
    await recordProgress(monthKey, { rowsReset, detail, finished: false }).catch(() => {});
    throw err;
  }
}

let running = false;
const cronJobs = [];

/**
 * Start the daily check. Deliberately daily, not monthly.
 *
 * The reset is guarded by the month claim and by the prior-month filter, so the
 * correct behaviour is: the first run on/after the 1st performs the rollover,
 * and every later run that month is a cheap no-op. That gives a missed-first-of-
 * month safety net: if the server was down on the 1st, the rollover happens as
 * soon as it next starts, instead of the month silently never resetting.
 *
 * Exported rather than auto-run on import because the cron endpoint also imports
 * this module, and that endpoint is reachable on Vercel where no long-lived
 * scheduler should be created.
 */
function start() {
  if (running) return;
  running = true;
  const runNoOverlap = makeNonOverlap('fro monthly rollover', () => runMonthlyRollover());
  // 04:00 Asia/Kolkata, early enough to finish before the calling shift and
  // explicit about the timezone so server locale can never shift the boundary.
  cronJobs.push(cron.schedule('0 4 * * *', () => runNoOverlap().catch(() => {}), { timezone: 'Asia/Kolkata' }));
  console.log('Scheduled: daily 04:00 IST FRO month-rollover check');
}

function stop() {
  for (const job of cronJobs) job.stop();
  cronJobs.length = 0;
  running = false;
  console.log('FRO month-rollover scheduler stopped');
}

export { start, stop };
