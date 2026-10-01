// The single re-arm point for the FRO's 4-minute live window.
//
// The window logic used to live inside createDonorLogHandler only, keyed on the
// painted worker id and gated to dispositions. That produced three sibling bugs:
//
//   - Any recorded action other than a disposition (donation, call, visit,
//     message, follow_up, note) reset the client's clock but not the server's
//     deadline, so a FRO who worked through the day without a disposition was
//     stamped idle ~4 minutes after their first action regardless of effort.
//   - Under work-as the disposition save wrote the COVERED FRO's row while
//     every heartbeat/status read used the operator's row, so the operator's own
//     row kept a lapsed deadline and accrued idle for work they were demonstrably
//     doing.
//   - Claiming a suspense receipt and re-saving a duplicate (unique-violation
//     "success") never touched the window at all.
//
// Everything that needs a fresh window goes through resetLiveWindow() with the
// HUMAN worker id (the person at the keyboard) — the same identity the
// heartbeat, /status/me, and every board read already uses. buildLiveWindow()
// is the pure arithmetic so the rule is unit-testable without a database.
import db from '../config/db.js';
import {
  DISPOSITION_WINDOW_SECONDS,
  dispositionDueMs,
  getShiftWindowMs,
  istDateStr,
  liveIdleSeconds,
  nextDeadline,
} from '../utils/froIdle.js';
import { writeDailySnapshot, rollCountersForNewDay, COUNTER_COLUMNS } from './froCounterDay.js';

// Pure: derive the upsert patch and the client-facing timer from a row + shift.
//
// A successful save always re-arms: idle now means "no recorded activity for 4
// minutes", so any action buys a fresh window. Elapsed idle is folded into
// today_idle_seconds BEFORE idle_since is cleared (an overdue save still pays
// for the minutes between the deadline and now), and a paused/meeting row keeps
// its status instead of being punched back to 'online' through the freeze.
export function buildLiveWindow({ workerId, liveRow, shift, nowMs = Date.now() }) {
  const due = nextDeadline(shift, nowMs);
  const frozen = !!(liveRow?.is_paused) || liveRow?.status === 'meeting';
  const patch = {
    worker_id: workerId,
    disposition_due_at: due,
    idle_since: null,
    updated_at: new Date(nowMs).toISOString(),
    stats_date: istDateStr(new Date(nowMs)),
  };

  const dueMs = dispositionDueMs(liveRow);
  const overdue = !frozen && Number.isFinite(dueMs) && nowMs > dueMs;
  if (overdue) {
    const startMs = Number.isFinite(shift?.startMs) ? Math.max(dueMs, shift.startMs) : dueMs;
    patch.today_idle_seconds = liveIdleSeconds(
      { ...liveRow, idle_since: new Date(startMs).toISOString() },
      shift,
      nowMs,
    );
  } else if (liveRow?.idle_since) {
    patch.today_idle_seconds = liveIdleSeconds(liveRow, shift, nowMs);
  }

  // Punch an idle row back online, but never through a freeze the admin set.
  if (liveRow?.status === 'idle' && !frozen) {
    patch.status = 'online';
    patch.current_donor_id = null;
    patch.call_started_at = null;
  }

  const timer = {
    disposition_due_at: due,
    seconds_left: due ? DISPOSITION_WINDOW_SECONDS : null,
    is_idle: false,
    today_idle_seconds: patch.today_idle_seconds ?? liveRow?.today_idle_seconds ?? 0,
  };

  return { patch, timer };
}

// Re-arm the human-at-the-keyboard's live window after a successful save.
//
// `workerId` must already be the HUMAN id (operator under work-as, plain id
// otherwise). Shift and db are injectable so the orchestration can be tested
// without a database; the live-status read/upsert and the daily snapshots all
// go through dbClient. Returns the timer shape the client adopts, or null.
export async function resetLiveWindow(workerId, {
  nowMs = Date.now(),
  dbClient = db,
  getShift = getShiftWindowMs,
  dbg = 'action',
} = {}) {
  const shift = await getShift(workerId, nowMs);
  const { data: liveRow } = await dbClient
    .from('fro_live_status')
    .select('*')
    .eq('worker_id', workerId)
    .maybeSingle();

  // Bank a stale row's day and start today at zero BEFORE the window is rebuilt.
  //
  // buildLiveWindow always stamps stats_date to today. If this row still described
  // yesterday - nobody stamped the FRO, no heartbeat landed, the machine was off -
  // that stamp used to relabel yesterday's accumulated counters as today's
  // WITHOUT banking them to fro_daily_stats. Two consequences: the day's real total
  // was lost, and because the counters can only ever rise (GREATEST on both the
  // snapshot and the row), today started above zero and could not be walked back.
  // The rollover is what makes an impossible day like 52h unrepresentable, so it
  // has to run before the patch is built, not after.
  const roll = await rollCountersForNewDay(workerId, liveRow, nowMs, { dbg: 'live-window-roll' });

  const baseRow = roll.rolled
    ? { ...liveRow, ...roll.counters, idle_since: null, disposition_due_at: null, stats_date: roll.statsDate }
    : liveRow;

  const { patch, timer } = buildLiveWindow({ workerId, liveRow: baseRow, shift, nowMs });

  // baseRow already reads as zeroed, but the patch is a partial upsert: columns it
  // omits keep their old stored values. Name every counter explicitly so a
  // relabelled row cannot carry a previous day forward.
  if (roll.rolled) {
    for (const col of COUNTER_COLUMNS) patch[col] = 0;
  }

  await dbClient.from('fro_live_status').upsert(patch, { onConflict: 'worker_id' });
  if (patch.today_idle_seconds !== undefined) {
    await writeDailySnapshot(workerId, istDateStr(new Date(nowMs)), {
      idle_seconds: patch.today_idle_seconds,
    }, {
      extraCapMs: Number.isFinite(shift?.startMs) && Number.isFinite(shift?.endMs)
        ? Math.max(0, shift.endMs - shift.startMs)
        : NaN,
      dbg,
    });
  }

  return timer;
}