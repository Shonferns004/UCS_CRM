import db from '../config/db.js';
import { getShiftWindowMs, liveIdleSeconds, idlePeriodStartMs, istDateStr } from '../utils/froIdle.js';

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
