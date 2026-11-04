import db from '../config/db.js';
import { istMonthKey, istMonthStartUtc } from '../utils/ist.js';
import { makeNonOverlap } from '../utils/noOverlap.js';
import cron from 'node-cron';

// ─── Monthly FRO lead rollover ───────────────────────────────────────────────
// The month boundary must NOT throw away work or promises:
//
//   • A lead that was already dispositioned (donation done, refusal, wrong
//     number, completed call, …) keeps its status, so it stays in History and
//     does NOT reappear in My Leads as a "fresh pending" lead.
//   • A follow-up keeps everything: the status (follow_up / callback /
//     scheduled / promise), next_follow_up and its fro_scheduled_contacts row.
//     An October follow-up therefore still shows up in November (Follow Ups if
//     it is still ahead, Overdue if its time has passed).
//
// This job used to reset every worked status to 'pending' AND clear
// next_follow_up AND delete the open scheduled contacts. On 2026-11-01 that
// wiped 116,939 leads back into My Leads and destroyed 1,429 open follow-ups
// (769 scheduled + 660 callback), which is exactly the "last month's follow-ups
// vanished" complaint. The status reset is now disabled; the only thing that
// re-opens a lead is the rolling refusal cooldown below (a deliberate 60-day
// rule).
//
// What the job still does:
//   • archives the previous month's non-financial call log (History reads it
//     through ?all_months=true, so nothing is lost from the FRO's view);
//   • runs the rolling not_interested cooldown;
//   • records the month in fro_month_rollover_log for audit.
//
// Scope note: DND is per (donor, ngo). A donor marked DND at one NGO stays
// callable at an unrelated NGO; that is the approved behaviour.
export const ROLLOVER_MODE = 'preserve_statuses';

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
    // Status only — next_follow_up survives (see the header comment).
    await db._pool.query(
      `UPDATE public.fro_assignments
          SET status = 'pending',
              rollover_from_status = status, rollover_at = now()
        WHERE id = ANY($1::int[])`,
      [ids]
    );
    rowsReset += ids.length;
  }
  return rowsReset;
}

// ─── Prior-month call history ────────────────────────────────────────────────
// The FRO asked for History to start clean each month, so the rollover also
// archives the previous month's call log. This is the ONLY place fro_donor_logs
// rows are ever removed, and it is deliberately narrow.
//
// Moved to fro_donor_logs_archive (full rows, restorable by id):
//   action = 'disposition', created before the month boundary, with no money on
//   the row and no receipt pointing at it. That is a call attempt record — the
//   "we tried, no answer / not interested" bookkeeping — and nothing else.
//
// NEVER moved, whatever their date:
//   • action = 'donation'                          — a donation is a financial record
//   • disposition_detail='lead_done' AND
//     accounts_status='verified'                   — fetchScopedDonationEvidence
//                                                    builds activeAssignmentIds,
//                                                    verifiedAssignmentIds and
//                                                    periodDonatedAssignmentIds
//                                                    from exactly these two shapes
//                                                    (froController.js). Deleting
//                                                    them silently flips leads to
//                                                    inactive in My Leads.
//   • amount_collected / upi_transaction_id /
//     payment_screenshot_url set                  — money was taken
//   • any row referenced by receipts.log_id       — ON DELETE CASCADE, so removing
//                                                    the log would remove the
//                                                    receipt. (No receipt currently
//                                                    references a log, but the FK is
//                                                    there and must not be trusted.)
//
// The per-donor timeline keeps working: the "monthly reset" entry is synthesised
// from fro_assignments.rollover_from_status / rollover_at (migration 167), not
// from these rows.
const ARCHIVE_TABLE = 'public.fro_donor_logs_archive';

// Created here as well as in migration 169 so a deploy that lands the service
// before the migration degrades to a no-op instead of throwing inside the cron.
const ARCHIVE_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS ${ARCHIVE_TABLE} (
    archived_at            timestamptz      NOT NULL DEFAULT now(),
    archive_month          text             NOT NULL,
    id                     integer          NOT NULL,
    assignment_id          integer          NOT NULL,
    action                 text             NOT NULL,
    notes                  text,
    outcome                text,
    amount_collected       numeric(12,2),
    created_by             uuid,
    created_at             timestamptz      NOT NULL,
    disposition_category   text,
    disposition_detail     text,
    scheduled_at           timestamptz,
    payment_screenshot_url text,
    accounts_status        text,
    pan_number             text,
    verified_at            timestamptz,
    verified_by            uuid,
    donor_id               integer,
    fro_worker_id          uuid,
    remark                 text,
    upi_transaction_id     text,
    transaction_datetime   timestamptz,
    payment_from           text,
    payment_mode           text,
    rejection_reason       text
  )`;

const ARCHIVE_COLUMNS = `id, assignment_id, action, notes, outcome, amount_collected,
  created_by, created_at, disposition_category, disposition_detail, scheduled_at,
  payment_screenshot_url, accounts_status, pan_number, verified_at, verified_by,
  donor_id, fro_worker_id, remark, upi_transaction_id, transaction_datetime,
  payment_from, payment_mode, rejection_reason`;

// Same list, table-qualified, for DELETE ... RETURNING inside the CTE.
const ARCHIVE_COLUMNS_QUALIFIED = ARCHIVE_COLUMNS
  .split(',')
  .map(c => `l.${c.trim()}`)
  .join(', ');

/**
 * Archive and delete the previous month's non-financial call log.
 *
 * Runs after the status reset in the same run, batched by id cursor like the
 * reset itself, and idempotent: an archived row is gone, so a re-run finds
 * nothing. Each batch is a single statement — DELETE ... RETURNING feeding an
 * INSERT — so a crash mid-batch can never leave a row deleted but unarchived.
 *
 * @returns {Promise<number>} rows moved into the archive table.
 */
async function archivePriorMonthLogs(monthStart, monthKey) {
  await db._pool.query(ARCHIVE_TABLE_DDL);
  await db._pool.query(`CREATE INDEX IF NOT EXISTS idx_fdl_archive_month
                          ON ${ARCHIVE_TABLE} (archive_month)`);
  await db._pool.query(`CREATE INDEX IF NOT EXISTS idx_fdl_archive_assignment
                          ON ${ARCHIVE_TABLE} (assignment_id)`);

  // Every predicate term is load-bearing; see the block comment above.
  const archivable = `
      l.created_at < $2
      AND l.action <> 'donation'
      AND NOT (l.disposition_detail = 'lead_done' AND l.accounts_status = 'verified')
      AND (l.amount_collected IS NULL OR l.amount_collected = 0)
      AND l.upi_transaction_id IS NULL
      AND l.payment_screenshot_url IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.receipts r WHERE r.log_id = l.id)`;

  let cursor = 0;
  let archived = 0;
  for (;;) {
    const batch = await db._pool.query(
      `SELECT l.id FROM public.fro_donor_logs l
        WHERE l.id > $1 AND ${archivable}
        ORDER BY l.id
        LIMIT $3`,
      [cursor, monthStart, BATCH_SIZE]
    );
    const rows = batch.rows || [];
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    await db._pool.query(
      `WITH moved AS (
         DELETE FROM public.fro_donor_logs l
          WHERE l.id = ANY($1::int[]) AND ${archivable}
          RETURNING ${ARCHIVE_COLUMNS_QUALIFIED}
       )
       INSERT INTO ${ARCHIVE_TABLE} (archive_month, ${ARCHIVE_COLUMNS})
       SELECT $3, ${ARCHIVE_COLUMNS} FROM moved`,
      [rows.map(r => r.id), monthStart, monthKey]
    );
    archived += rows.length;
  }
  return archived;
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
 *                    rowsReset:number, cooldownReset:number, logsArchived?:number,
 *                    detail:object}>}
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
  // that had already been worked in the current month.
  //
  // Month-start is still used to decide which log rows belong to the previous
  // month (the archive step below), never to decide which lead statuses reset.
  const monthStart = opts.monthStart || istMonthStartUtc();

  // Refusal cooldown first and unconditional: it is a rolling daily schedule,
  // so a refusal returns on its due day whether or not the month's claim below
  // has already finished.
  const cooldownReset = await runNotInterestedCooldown();

  if (!opts.force) {
    const { proceed, row } = await claimMonth(monthKey, mode);
    if (!proceed) {
      console.log(`FRO monthly rollover ${monthKey}: already finished, skipping.`, JSON.stringify(row || {}));
      if (cooldownReset) console.log(`FRO refusal cooldown: reset ${cooldownReset} not_interested leads to pending`);
      return { skipped: true, monthKey, mode, rowsReset: 0, cooldownReset, detail: {} };
    }
  }

  const detail = { monthStart: monthStart.toISOString(), statusReset: 'disabled' };
  const rowsReset = 0;

  try {
    // Statuses are deliberately NOT reset. A month boundary is not a reason to
    // turn a used lead back into "fresh pending" work, and it is definitely not
    // a reason to move it out of History. Likewise next_follow_up and
    // fro_scheduled_contacts are never touched: a follow-up is a promise made to
    // a donor, so an October follow-up must still be visible in November.
    await recordProgress(monthKey, { rowsReset, detail, finished: false });

    const logsArchived = await archivePriorMonthLogs(monthStart, monthKey);
    detail.logsArchived = logsArchived;

    await recordProgress(monthKey, { rowsReset, detail, finished: true });
    console.log(`FRO monthly rollover ${monthKey} (${mode}): preserved all lead statuses/follow-ups; archived ${logsArchived} prior-month call logs; refusal cooldown reset ${cooldownReset}`);
    return { monthKey, mode, rowsReset, cooldownReset, logsArchived, detail };
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
  //
  // The catch MUST log. This used to be `.catch(() => {})`, which meant a failing
  // rollover was completely invisible: migration 166 had never been applied on this
  // database, so the 04:00 job threw every single day for months and nobody saw a
  // single symptom. A monthly job fails exactly once per month, so "nobody
  // noticed" is the default outcome unless the error is written down. Anything
  // that breaks the month claim (missing table, missing column, bad mode value)
  // lands here, and now it names the month and the reason.
  cronJobs.push(cron.schedule('0 4 * * *', () => {
    runNoOverlap().catch((err) => {
      const monthKey = istMonthKey();
      console.error(`FRO monthly rollover FAILED for ${monthKey}: ${err?.message || err}`);
      if (err?.stack) console.error(err.stack);
      // Leave the month unclaimed (finished_at stays NULL) so tomorrow's run
      // retries rather than silently skipping the reset for the whole month.
    });
  }, { timezone: 'Asia/Kolkata' }));
}

function stop() {
  for (const job of cronJobs) job.stop();
  cronJobs.length = 0;
  running = false;
  console.log('FRO month-rollover scheduler stopped');
}

export { start, stop };
