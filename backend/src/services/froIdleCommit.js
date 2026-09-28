import db from '../config/db.js';
import {
  getShiftWindowMs, liveIdleSeconds, idlePeriodStartMs, istDateStr,
  withinShift, dispositionDueMs,
} from '../utils/froIdle.js';

// Committing idle when an FRO session ENDS (manual sign-out or the shift-end
// auto-logout sweep).
//
// Why this exists: while someone is sitting idle, today_idle_seconds holds only
// COMMITTED time and the running stretch lives in idle_since. Every read adds
// them together, so the numbers on screen are always right — but the *stored*
// day total, and therefore the fro_daily_stats row the monthly salary total
// sums, only ever sees the last value a heartbeat happened to write. If a
// session ends while a period is still open, that tail is missing from the
// monthly figure. Both exit paths call this so nothing is lost.
//
// capMs optionally clamps the open period to a known shift end, so the
// auto-logout sweep (which fires shift-end + grace) cannot credit idle for the
// grace minutes after the officer had already gone home.

// Stamping idle the moment the disposition window lapses.
//
// today_idle_seconds only ever holds COMMITTED time, and the running stretch
// lives in idle_since — which is only written by a status push. There is no
// heartbeat, so an FRO who lets the window lapse and then leaves the app
// untouched keeps a row with a lapsed deadline and idle_since = NULL. Reads
// recover the stretch from the deadline, so the number on screen is right, but
// the STORED total stays at whatever it was (often 0). Anything reading the
// stored column — the NGO-admin board, fro_daily_stats, the monthly salary
// total — then disagrees with the strip by however long the officer sat there.
//
// This closes that gap by writing the stamp at the moment the deadline passes,
// so the row's own arithmetic matches the derived one. It is deliberately
// idempotent and never double counts: idle_since is set to the deadline, which
// is exactly where idlePeriodStartMs already begins counting, so a later commit
// banks the identical span.
export async function stampLapsedIdle(workerId, nowMs = Date.now()) {
  const id = String(workerId);
  if (!id) return false;

  let row = null;
  try {
    const { rows } = await db._pool.query(
      `SELECT today_idle_seconds, idle_since, disposition_due_at, is_paused, status
         FROM fro_live_status
        WHERE worker_id = $1
        LIMIT 1`,
      [id]
    );
    row = rows && rows[0] ? rows[0] : null;
  } catch (e) {
    console.warn('[froIdleCommit] live row read failed:', e?.message || String(e));
    return false;
  }
  if (!row) return false;

  // Already stamped — a real open period, so nothing to reconcile.
  if (row.idle_since) return false;
  // Admin-held rows are not the FRO sitting idle.
  if (row.is_paused || row.status === 'meeting') return false;

  const due = dispositionDueMs(row);
  if (!Number.isFinite(due) || nowMs < due) return false;
  // A deadline from a previous IST day is stale, not an open period today.
  if (istDateStr(new Date(due)) !== istDateStr(new Date(nowMs))) return false;

  try {
    const shift = await getShiftWindowMs(id, nowMs);
    if (!withinShift(shift, nowMs)) return false;
  } catch (_) {
    return false;
  }

  try {
    await db._pool.query(
      `UPDATE fro_live_status
          SET idle_since = disposition_due_at,
              status = 'idle',
              updated_at = now()
        WHERE worker_id = $1
          AND idle_since IS NULL`,
      [id]
    );
    return true;
  } catch (e) {
    console.warn('[froIdleCommit] idle stamp failed:', e?.message || String(e));
    return false;
  }
}

export async function commitIdleOnExit(workerId, nowMs = Date.now(), capMs = null) {
  const id = String(workerId);
  if (!id) return null;

  let row = null;
  try {
    const { rows } = await db._pool.query(
      `SELECT today_idle_seconds, idle_since, disposition_due_at, is_paused, status,
              today_calls, today_talk_seconds
         FROM fro_live_status
        WHERE worker_id = $1
        LIMIT 1`,
      [id]
    );
    row = rows && rows[0] ? rows[0] : null;
  } catch (e) {
    console.warn('[froIdleCommit] live row read failed:', e?.message || String(e));
    return null;
  }
  if (!row) return null;

  let endMs = nowMs;
  if (Number.isFinite(capMs)) endMs = Math.min(nowMs, capMs);
  else {
    // No caller-supplied cap: still clamp to the officer's real shift so a
    // sign-out hours after hours end cannot bill idle against tomorrow.
    try {
      const shift = await getShiftWindowMs(id, nowMs);
      if (Number.isFinite(shift?.endMs)) endMs = Math.min(nowMs, shift.endMs);
    } catch (_) {
      // Attendance unreadable — fall back to "up to now".
    }
  }

  const total = liveIdleSeconds(row, { startMs: -Infinity, endMs }, nowMs);
  const calls = Number(row.today_calls || 0);
  const talk = Number(row.today_talk_seconds || 0);
  const hadOpen = Number.isFinite(idlePeriodStartMs(row, nowMs));

  try {
    // disposition_due_at is cleared too: with it still in the past, the
    // deadline-derived fallback in liveIdleSeconds would re-open a period that
    // we just banked and count the same seconds a second time.
    await db._pool.query(
      `UPDATE fro_live_status
          SET today_idle_seconds = GREATEST(COALESCE(today_idle_seconds, 0), $2::int),
              idle_since = NULL,
              disposition_due_at = NULL,
              updated_at = now()
        WHERE worker_id = $1`,
      [id, Math.max(0, Math.round(total))]
    );
  } catch (e) {
    console.warn('[froIdleCommit] live row update failed:', e?.message || String(e));
  }

  // Daily snapshot so the monthly salary total includes the tail. GREATEST on
  // every counter because these only grow within a day.
  try {
    await db._pool.query(
      `INSERT INTO fro_daily_stats (worker_id, stat_date, talk_seconds, calls, idle_seconds, updated_at)
       VALUES ($1, $2::date, GREATEST(0, $3::int), GREATEST(0, $4::int), GREATEST(0, $5::int), now())
       ON CONFLICT (worker_id, stat_date) DO UPDATE SET
         talk_seconds = GREATEST(fro_daily_stats.talk_seconds, EXCLUDED.talk_seconds),
         calls        = GREATEST(fro_daily_stats.calls,        EXCLUDED.calls),
         idle_seconds = GREATEST(fro_daily_stats.idle_seconds, EXCLUDED.idle_seconds),
         updated_at   = now()`,
      [id, istDateStr(new Date(nowMs)), talk, calls, Math.max(0, Math.round(total))]
    );
  } catch (e) {
    // Non-fatal: fro_daily_stats may be absent until migration 126.
  }

  return { total: Math.max(0, Math.round(total)), hadOpen, calls, talk };
}
