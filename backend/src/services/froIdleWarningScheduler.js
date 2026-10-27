// froIdleWarningScheduler — sends the three HR idle warnings on their own.
//
// WHY THIS EXISTS
// ---------------
// The Warn button on the Telecaller Performance board requires an admin to be
// watching the board and click at the right moment. The warning is an HR
// escalation tied to a fixed idle band, so it must go out when the FRO's own
// today-idle figure enters each band, not when somebody happens to notice.
//
// WHAT "TODAY IDLE" MEANS HERE
// ----------------------------
// The same figure the board's IDLE cell and the FRO's own My Leads strip show:
// the day total from the fro_time_sessions ledger when that worker has ledger
// rows today, otherwise today_idle_seconds plus the still-running period,
// clamped to the shift (effectiveIdleSeconds). The ledger matters because a
// closed idle stretch is banked there the moment the FRO resumes, while the
// live-row counter may not be committed until logout; reading only the live
// row would let the board show orange while this sweep still saw green.
//
// ONCE PER TIER PER IST DAY
// -------------------------
// Delivery is deduped in memory per worker + IST day + tier. The FRO panel also
// guards auto alerts in localStorage (see FROPanel), so a server restart in the
// middle of a band cannot re-open the same warning on their screen. No new
// tracking table and no migration: nothing else needs to read this history.
//
// Only FROs with a live panel socket are considered. An alert emitted while the
// tab is closed would be lost anyway, and skipping them means the tier stays
// unmarked and is delivered the moment they reconnect mid-band.

import db from '../config/db.js';
import { emitRealtime, isWorkerOnline } from '../socket.js';
import {
  effectiveIdleSeconds,
  getShiftWindowsMs,
  istDateStr,
  withinShift,
} from '../utils/froIdle.js';
import { idleAlertFor, idleAlertLevelForSeconds } from '../utils/idleAlert.js';
import { dayTotalsForWorkers } from './froTimeSessions.js';
import { makeNonOverlap } from '../utils/noOverlap.js';

const DEFAULT_INTERVAL_MS = 30 * 1000;
const MAX_ROWS = 1000;

// `${workerId}|${istDay}|${level}` -> epoch ms it was sent. Kept for the
// current IST day only; yesterday's tiers are irrelevant once the day rolls.
const sentToday = new Map();

function prune(day) {
  for (const key of sentToday.keys()) {
    if (!key.includes(`|${day}|`)) sentToday.delete(key);
  }
}

/**
 * One sweep. Exported so the behaviour can be exercised without waiting for the
 * interval (and so a cron endpoint could call it if one is ever needed).
 *
 * opts exists for tests: rows / isOnline / emit / getShiftWindows / getDayTotals / names.
 * Production callers pass nothing beyond `nowMs`.
 */
export async function runIdleWarningSweep(nowMs = Date.now(), opts = {}) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const day = istDateStr(new Date(now));
  const isOnline = opts.isOnline || isWorkerOnline;
  const emit = opts.emit || emitRealtime;
  const getShiftWindows = opts.getShiftWindows || getShiftWindowsMs;
  const getDayTotals = opts.getDayTotals || dayTotalsForWorkers;

  let rows = opts.rows;
  if (!rows) {
    // fro_live_status has no is_active column (activity lives on workers), and
    // the board itself reads this table by worker id with no activity filter.
    // Presence is decided below by isWorkerOnline(), which is what actually
    // matters here: an offline panel cannot display a modal.
    const { data, error } = await db
      .from('fro_live_status')
      .select('worker_id, today_idle_seconds, idle_since, disposition_due_at, is_paused, status, stats_date, updated_at, frozen_at')
      .not('worker_id', 'is', null)
      .limit(MAX_ROWS);
    if (error) throw new Error(error.message);
    rows = data || [];
  }

  // A held row (meeting/admin pause) is not the FRO stalling, and an offline
  // panel cannot show a modal. Drop both before any per-worker reads.
  //
  // There is deliberately no "below green" pre-filter here: the live counter can
  // read 0 while the ledger already holds a closed idle stretch for the day, so
  // the band cannot be decided until the ledger total is read below.
  const candidates = (rows || []).filter((row) =>
    !!row?.worker_id && !row.is_paused && row.status !== 'meeting'
  );
  if (candidates.length === 0) {
    prune(day);
    return { checked: (rows || []).length, warned: 0, levels: [] };
  }

  const online = candidates.filter((row) => {
    try { return !!isOnline(String(row.worker_id)); } catch (_) { return false; }
  });
  if (online.length === 0) {
    prune(day);
    return { checked: (rows || []).length, warned: 0, levels: [] };
  }

  let shiftMap = {};
  try {
    shiftMap = (await getShiftWindows(online.map((row) => row.worker_id), now)) || {};
  } catch (e) {
    // Without the shift the committed total (today_idle_seconds) is still
    // trustworthy; effectiveIdleSeconds just cannot clamp the open period.
    console.warn('[froIdleWarnings] shift lookup failed:', e?.message || String(e));
  }

  let names = opts.names;
  if (!names) {
    names = {};
    try {
      const ids = online.map((row) => row.worker_id);
      const { data } = await db.from('workers').select('id, name').in('id', ids);
      for (const w of data || []) names[w.id] = w.name;
    } catch (e) {
      console.warn('[froIdleWarnings] worker name lookup failed:', e?.message || String(e));
    }
  }

  // The board's IDLE cell prefers the authoritative ledger total and falls
  // back to the live row only when there is no ledger row for today. Read the
  // same figure in one batched query so the warning and the board agree.
  let ledgerTotals = new Map();
  try {
    ledgerTotals = await getDayTotals(online.map((row) => row.worker_id), {
      nowMs: now,
      shiftFor: (id) => shiftMap[String(id)] || null,
    });
  } catch (e) {
    console.warn('[froIdleWarnings] ledger idle read failed:', e?.message || String(e));
  }

  let warned = 0;
  const levels = [];

  for (const row of online) {
    const id = String(row.worker_id);
    const shift = shiftMap[id] || null;
    // Outside the shift the figure is frozen at shift end; there is no live
    // work to warn about, and the panel is normally closed anyway.
    if (shift && !withinShift(shift, now)) continue;

    const ledgerDay = ledgerTotals.get(id);
    const seconds = ledgerDay
      ? (Number(ledgerDay.idle_seconds) || 0)
      : effectiveIdleSeconds(row, shift, now);
    const level = idleAlertLevelForSeconds(seconds);
    if (!level) continue;

    const key = `${id}|${day}|${level}`;
    if (sentToday.has(key)) continue;

    const alert = idleAlertFor(level, names[id]);
    if (!alert) continue;

    // Mark BEFORE emitting: a socket throw must not turn the next tick into a
    // duplicate. The FRO panel's own guard covers a restart that loses this map.
    sentToday.set(key, now);
    warned++;
    levels.push({ workerId: id, level });

    try {
      emit('fro:action', {
        type: 'idle_alert',
        targetWorkerId: id,
        level,
        title: alert.title,
        body: alert.body,
        // Distinguishes the automatic band crossing from an admin's manual
        // Warn click, so the panel can dedupe one without hiding the other.
        auto: true,
        idle_seconds: seconds,
        sent_at: new Date(now).toISOString(),
      }, 'role:fro');
    } catch (e) {
      console.warn('[froIdleWarnings] emit failed:', e?.message || String(e));
    }
  }

  prune(day);
  return { checked: (rows || []).length, warned, levels };
}

let _job = null;

async function wrappedRun(nowMs = Date.now()) {
  try {
    await runIdleWarningSweep(nowMs);
  } catch (e) {
    console.warn('[froIdleWarnings] sweep failed:', e?.message || String(e));
  }
}

export function start(intervalMs = DEFAULT_INTERVAL_MS) {
  if (_job) return _job;
  const nonOverlap = makeNonOverlap('[froIdleWarnings]', wrappedRun);
  _job = setInterval(() => {
    nonOverlap(Date.now()).catch(() => {});
  }, intervalMs);
  if (_job.unref) _job.unref();
  return _job;
}

export function stop() {
  if (_job) {
    clearInterval(_job);
    _job = null;
  }
  sentToday.clear();
}
