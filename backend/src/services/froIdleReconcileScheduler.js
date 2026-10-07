// froIdleReconcileScheduler — server-side sweep to backfill idle after deadline expiry
//
// WHY THIS EXISTS
// ---------------
// The lazy path (stampLapsedIdle via read requests) only runs when some request
// arrives after the disposition deadline. If the FRO does nothing after
// disposition_due_at expires (browser closed, frozen tab, network silent) the
// row is never stamped: idle_since stays NULL, the ledger is never transitioned,
// and "today_idle_seconds" never receives the tail. The UI can still infer via
// reads, but the persisted total (daily/board/monthly paths) stays behind.
//
// This periodic reconciliation sweeps fro_live_status for workers whose deadline
// has lapsed with no stamp, or whose settle window has expired with no deadline
// armed. It applies the same invariants as the lazy path, stamps idle
// retroactively at the correct start time (without touching updated_at on the
// background sweep), and reconciles the time ledger to WORKING → IDLE at the
// appropriate start. It runs every ~30s in the non-Vercel runtime via node-cron
// + the existing makeNonOverlap wrapper. An explicit cron endpoint also exposes
// it for serverless/external invocation.

import db from '../config/db.js';
import {
  dispositionDueMs,
  getShiftWindowMs,
  istDateStr,
  withinShift,
  DISPOSITION_WINDOW_SECONDS,
} from '../utils/froIdle.js';
import { isCoveredAway as defaultIsCoveredAway } from './froCoverFreeze.js';
import { isCounterDayStale } from './froCounterDay.js';
import { getOpenSession as defaultGetOpenSession } from './froTimeSessions.js';
import { isHeldState } from '../utils/froTimeState.js';
import { reconcileDispositionIdle as defaultReconcileDispositionIdle } from './froTimeReconcile.js';
import { makeNonOverlap } from '../utils/noOverlap.js';

const DEFAULT_INTERVAL_MS = 30 * 1000; // 30 seconds

export function deriveDeadlineFromSettle(settleUntilMsVal, nowMs = Date.now()) {
  if (!Number.isFinite(settleUntilMsVal)) return { deadlineMs: NaN, armed: false };
  const deadlineMs = settleUntilMsVal + DISPOSITION_WINDOW_SECONDS * 1000;
  return { deadlineMs, armed: true };
}

async function runReconciliationOnce(nowMs = Date.now(), opts = {}) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const today = istDateStr(new Date(now));
  const pool = opts.pool || db._pool;
  const isCoveredAway = opts.isCoveredAway || defaultIsCoveredAway;
  const getOpenSession = opts.getOpenSession || defaultGetOpenSession;
  const reconcileDispositionIdle = opts.reconcileDispositionIdle || defaultReconcileDispositionIdle;
  const getShiftWindowMsFn = opts.getShiftWindowMs || getShiftWindowMs;

  // Candidates: deadline already passed, not yet stamped, and have a deadline.
  let candidatesA = [];
  try {
    const { rows } = await pool.query(
      `SELECT worker_id, today_idle_seconds, idle_since, disposition_due_at,
              settle_until, is_paused, status, stats_date
         FROM fro_live_status
        WHERE disposition_due_at IS NOT NULL
          AND idle_since IS NULL
          AND disposition_due_at <= to_timestamp($1 / 1000.0)
        ORDER BY disposition_due_at ASC
        LIMIT 200`,
      [now]
    );
    candidatesA = rows || [];
  } catch (e) {
    console.warn('[froIdleReconcile] candidate A query failed:', e?.message || String(e));
    candidatesA = [];
  }

  // Category B: expired settle, no deadline yet
  let candidatesB = [];
  try {
    const { rows } = await pool.query(
      `SELECT worker_id, today_idle_seconds, idle_since, disposition_due_at,
              settle_until, is_paused, status, stats_date
         FROM fro_live_status
        WHERE settle_until IS NOT NULL
          AND disposition_due_at IS NULL
          AND idle_since IS NULL
          AND settle_until <= to_timestamp($1 / 1000.0)
        ORDER BY settle_until ASC
        LIMIT 200`,
      [now]
    );
    candidatesB = rows || [];
  } catch (e) {
    console.warn('[froIdleReconcile] candidate B query failed:', e?.message || String(e));
    candidatesB = [];
  }

  const candidates = [...candidatesA, ...candidatesB];

  let stamped = 0;
  let reconciled = 0;
  let armed = 0;

  for (const row of candidates) {
    const id = row?.worker_id;
    if (!id) continue;

    // Guards (mirror stampLapsedIdle)
    try {
      if (await isCoveredAway(String(id), now)) continue;
    } catch (_) {
      continue;
    }

    // Already stamped
    if (row.idle_since) continue;
    // Legacy-held flags
    if (row.is_paused || row.status === 'meeting') continue;

    // Held states from ledger
    try {
      const openSess = await getOpenSession(String(id), { pool });
      if (openSess && isHeldState(openSess.state)) continue;
    } catch (_) {
      /* no ledger → legacy */
    }

    let due = dispositionDueMs(row);
    const hasDue = Number.isFinite(due);
    let derived = false;

    // If no deadline, derive from expired settle
    if (!hasDue && row.settle_until) {
      const settleMs = new Date(row.settle_until).getTime();
      if (Number.isFinite(settleMs) && settleMs <= now && istDateStr(new Date(settleMs)) === today) {
        const derivedDeadline = settleMs + DISPOSITION_WINDOW_SECONDS * 1000;
        due = derivedDeadline;
        derived = true;
        // Arm disposition_due_at at derived deadline (don't touch updated_at)
        try {
          const res = await pool.query(
            `UPDATE fro_live_status
                SET disposition_due_at = to_timestamp($2 / 1000.0)
              WHERE worker_id = $1
                AND disposition_due_at IS NULL
                AND idle_since IS NULL`,
            [String(id), derivedDeadline]
          );
          if (res?.rowCount > 0) armed++;
        } catch (e) {
          console.warn('[froIdleReconcile] arm deadline failed:', e?.message || String(e));
          continue; // don't stamp with stale view
        }
      } else {
        continue;
      }
    }

    if (!Number.isFinite(due) || now < due) continue;
    if (istDateStr(new Date(due)) !== today) continue;
    if (isCounterDayStale(row, now)) continue;

    let shift;
    try {
      shift = await getShiftWindowMsFn(String(id), now);
      if (!withinShift(shift, now)) continue;
    } catch (_) {
      continue;
    }

    // Stamp idle at disposition_due_at without touching updated_at (sweep safety)
    let didStamp = false;
    try {
      const res = await pool.query(
        `UPDATE fro_live_status
            SET idle_since = disposition_due_at,
                stats_date = $2::date,
                status = 'idle'
          WHERE worker_id = $1
            AND idle_since IS NULL`,
        [String(id), today]
      );
      didStamp = res?.rowCount > 0;
    } catch (e) {
      console.warn('[froIdleReconcile] idle stamp failed:', e?.message || String(e));
    }

    if (didStamp) {
      stamped++;
    }

    // Reconcile ledger to WORKING → IDLE at deadline (best-effort, non-blocking)
    try {
      const r = await reconcileDispositionIdle({
        workerId: String(id),
        liveRow: { ...row, disposition_due_at: row.disposition_due_at || new Date(due).toISOString(), idle_since: new Date(due).toISOString() },
        shift,
        nowMs: now,
        ...(opts.pool ? { pool: opts.pool } : {}),
      });
      if (r?.changed) reconciled++;
    } catch (e) {
      console.warn('[froIdleReconcile] ledger reconcile failed:', e?.message || String(e));
    }
  }

  return { processed: candidates.length, stamped, reconciled, armed };
}

export const runFroIdleReconciliation = runReconciliationOnce;

let _job = null;
let _running = false;

async function wrappedRun(nowMs = Date.now()) {
  if (_running) return;
  _running = true;
  try {
    await runReconciliationOnce(nowMs);
  } catch (e) {
    console.warn('[froIdleReconcile] run failed:', e?.message || String(e));
  } finally {
    _running = false;
  }
}

export function start(intervalMs = DEFAULT_INTERVAL_MS) {
  if (_job) return _job;
  const nonOverlap = makeNonOverlap(wrappedRun, '[froIdleReconcile]');
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
  _running = false;
}