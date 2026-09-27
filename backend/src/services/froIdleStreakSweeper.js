import db from '../config/db.js';
import { getOfficeEnd } from '../utils/attendanceStatus.js';
import { IDLE_LIVE_FRESH_MS } from '../utils/froIdle.js';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MAX_ROWS_PER_SWEEP = 200;

const istDayOf = (v) => {
  if (v === null || v === undefined) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
};

// Pure decision for one stale row. Extracted from the DB loop so the booking
// rules are unit-testable without a database.
//
// action 'drop' -> clear idle_since, change no counter (unusable streak start)
// action 'book' -> commit `elapsed` seconds on top of the committed counter
export function computeSweepForRow(row, { today, shiftEndMs, nowMs }) {
  const base = { action: 'drop', elapsed: 0, nextCommitted: Number(row.today_idle_seconds || 0) };

  const since = new Date(row.idle_since).getTime();
  if (!Number.isFinite(since)) return base;

  // Same-IST-day only. A streak that began on an earlier day was already handled
  // by that day's own reset; booking it into today would invent hours nobody was
  // present for. Drop the flag, book nothing.
  if (istDayOf(row.idle_since) !== today) return base;

  // Clamp to the worker's shift end: an overnight-stale row must never book
  // after-hours time.
  const end = Math.min(nowMs, Number.isFinite(shiftEndMs) ? shiftEndMs : nowMs);
  const elapsed = Math.max(0, Math.floor((end - since) / 1000));
  if (elapsed <= 0) return base;

  return { action: 'book', elapsed, nextCommitted: base.nextCommitted + elapsed };
}

// Books idle streaks the FRO panels abandoned, and clears the streak flag so the
// same span can never be booked twice.
//
// THE PROBLEM THIS SOLVES
// The FRO panel commits elapsed idle only when a streak closes, and the only
// thing telling the server a streak is still running is a 60s heartbeat
// (CallContext.jsx). If that heartbeat stops — old cached bundle, throttled
// background tab, laptop sleep, or the tab simply closed/killed mid-streak —
// the row's updated_at goes stale while idle_since stays set. Every read path
// deliberately ignores a streak on a stale row (it cannot distinguish "genuinely
// idle" from "panel died holding an open streak", and honouring the latter
// would report unbounded idle for a crashed FRO forever). So the whole streak
// was silently discarded: the FRO showed 0 idle for the rest of the day, and
// fro_daily_stats permanently under-counted it.
//
// This closes the loop from the server side. Once a row is stale, nothing can
// legitimately reopen its streak, so the elapsed time is committed here rather
// than thrown away.
//
// WHY IT CANNOT DOUBLE COUNT
// updateLiveStatus already keeps the larger of (stored, incoming) within the
// same IST day, and fro_daily_stats upserts with GREATEST. A panel that wakes
// back up and pushes its own (lower) in-memory total therefore cannot lower
// the swept value, and its own later close of the streak computes the same
// total rather than an additional one. Both guards are pre-existing; this
// function adds no new counting path.
export async function sweepAbandonedFroIdleStreaks() {
  const cutoff = new Date(Date.now() - IDLE_LIVE_FRESH_MS).toISOString();
  const today = istDayOf(Date.now());

  const { data: stale, error } = await db
    .from('fro_live_status')
    .select('worker_id, today_idle_seconds, idle_since, updated_at')
    .not('idle_since', 'is', null)
    .lt('updated_at', cutoff)
    .limit(MAX_ROWS_PER_SWEEP);
  if (error) throw error;
  if (!stale || stale.length === 0) return { swept: 0, cleared: 0, seconds: 0 };

  let swept = 0;
  let cleared = 0;
  let seconds = 0;

  for (const row of stale) {
    const workerId = row.worker_id;
    const end = await getOfficeEnd(workerId);
    const shiftEndMs = new Date(
      `${today}T${String(end.hour).padStart(2, '0')}:${String(end.minute).padStart(2, '0')}:00.000+05:30`
    ).getTime();
    const decision = computeSweepForRow(row, { today, shiftEndMs, nowMs: Date.now() });

    if (decision.action !== 'book') {
      const { error: clearErr } = await db
        .from('fro_live_status')
        .update({ idle_since: null })
        .eq('worker_id', workerId);
      if (!clearErr) cleared++;
      continue;
    }

    // updated_at is deliberately NOT touched: the panel really is gone, and the
    // read gates use that column to tell a live row from a dead one.
    const { error: upErr } = await db
      .from('fro_live_status')
      .update({ today_idle_seconds: decision.nextCommitted, idle_since: null })
      .eq('worker_id', workerId);
    if (upErr) continue;

    // Mirror into the daily snapshot (GREATEST, matching updateLiveStatus) so
    // monthly/period aggregates pick the swept time up too.
    try {
      await db._pool.query(
        `INSERT INTO fro_daily_stats (worker_id, stat_date, idle_seconds, talk_seconds, break_seconds, calls, skipped, updated_at)
         VALUES ($1, $2::date, GREATEST(0, $3), 0, 0, 0, 0, now())
         ON CONFLICT (worker_id, stat_date) DO UPDATE SET
           idle_seconds = GREATEST(fro_daily_stats.idle_seconds, EXCLUDED.idle_seconds),
           updated_at   = now()`,
        [workerId, today, decision.nextCommitted]
      );
    } catch (e) {
      // Non-fatal: fro_daily_stats may be absent until migration 126 is applied.
      console.error('[froIdleSweeper] daily stats write failed:', e?.message || String(e));
    }

    swept++;
    seconds += decision.elapsed;
  }

  if (swept > 0 || cleared > 0) {
    console.log(
      `[froIdleSweeper] ${today}: booked ${swept} abandoned streak(s) totalling ${seconds}s, cleared ${cleared} unusable streak flag(s)`
    );
  }
  return { swept, cleared, seconds };
}
