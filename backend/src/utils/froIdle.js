import db from '../config/db.js';
import { getOfficeStart, getOfficeEnd } from './attendanceStatus.js';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// The disposition deadline. From login the FRO gets this long to record a
// disposition; recording one resets it. When it lapses the FRO is idle until
// they press Resume.
export const DISPOSITION_WINDOW_SECONDS = 240;

// How stale a live-status row may be before a read that has no other way to
// tell treats it as dead. Deliberately NOT used to decide whether idle counts:
// the open period is derived from the stored deadline, so a powered-off monitor
// or a crashed tab still accrues. This only gates presence checks.
export const IDLE_LIVE_FRESH_MS = 3 * 60 * 1000;

export function istDateStr(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`;
}

function istTimeMs(dateStr, hour, minute) {
  return new Date(
    `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000+05:30`
  ).getTime();
}

function toMs(v) {
  if (!v) return NaN;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

/**
 * The FRO's shift window as epoch ms. Attendance is the source of truth: a
 * punch-in anchors the start and a punch-out caps the end. With no attendance
 * row we fall back to the configured shift times (worker's own shift first,
 * then the office-wide setting) so the timer still behaves sensibly.
 *
 * Returns { startMs, endMs, hasAttendance }. startMs/endMs may be NaN when
 * nothing is resolvable — callers treat that as "no window, accrue nothing".
 */
export async function getShiftWindowMs(workerId, nowMs = Date.now()) {
  const day = istDateStr(new Date(nowMs));
  let punchIn = NaN;
  let punchOut = NaN;
  try {
    const { data } = await db
      .from('attendance')
      .select('punch_in_time, punch_out_time')
      .eq('worker_id', workerId)
      .not('punch_in_time', 'is', null)
      .order('punch_in_time', { ascending: false })
      .limit(1)
      .maybeSingle();
    punchIn = toMs(data?.punch_in_time);
    punchOut = toMs(data?.punch_out_time);
  } catch (_) {
    // attendance may be unreadable — fall through to the configured shift.
  }

  const [officeStart, officeEnd] = await Promise.all([getOfficeStart(workerId), getOfficeEnd(workerId)]);
  const cfgStart = istTimeMs(day, officeStart.hour, officeStart.minute);
  const cfgEnd = istTimeMs(day, officeEnd.hour, officeEnd.minute);

  const hasAttendance = Number.isFinite(punchIn);
  let startMs = hasAttendance ? punchIn : cfgStart;
  let endMs = Number.isFinite(punchOut) ? punchOut : cfgEnd;

  // A row written for an earlier day must not anchor today's window.
  if (hasAttendance && istDateStr(new Date(punchIn)) !== day) {
    startMs = cfgStart;
    if (Number.isFinite(punchOut) && istDateStr(new Date(punchOut)) === day) endMs = punchOut;
    else endMs = cfgEnd;
  }
  if (!Number.isFinite(endMs) || endMs <= startMs) endMs = cfgEnd > startMs ? cfgEnd : startMs;

  return { startMs, endMs, hasAttendance };
}

/**
 * Are we inside the FRO's shift? Idle only accrues between shift start and
 * shift end, and the disposition timer only runs inside that window too.
 */
export function withinShift(shift, nowMs = Date.now()) {
  return Number.isFinite(shift?.startMs) && nowMs >= shift.startMs && nowMs <= shift.endMs;
}

/**
 * Start of the currently-open idle period, in epoch ms, or NaN when there is
 * none.
 *
 * Normally that is idle_since, stamped the first time a heartbeat notices the
 * deadline lapsed. But if the FRO's machine is off/asleep/closed there is no
 * heartbeat to stamp it, and the running period would be invisible — the officer
 * could sit out the rest of the shift with the money never counted. So when the
 * deadline has passed and nothing has been stamped yet, the deadline itself IS
 * the start of the period. That makes the open period derivable at any moment
 * from stored state alone, with no client cooperation.
 *
 * Paused/meeting rows are exempt — the admin is holding them, not the FRO.
 */
export function idlePeriodStartMs(row, nowMs = Date.now()) {
  const today = istDateStr(new Date(nowMs));
  const stamped = toMs(row?.idle_since);
  let from = NaN;
  if (Number.isFinite(stamped)) {
    // A period left over from a previous IST day is stale, not "currently idle".
    // Clipping it into today would invent idle from the shift start onwards for
    // an officer who did nothing, so drop it outright — the committed total it
    // would have been added to belongs to yesterday anyway.
    if (istDateStr(new Date(stamped)) !== today) return NaN;
    from = stamped;
  } else {
    // No stamp yet: a deadline that has already passed means the period began
    // then, and is derivable with no client cooperation (monitor off, tab
    // closed, crash). Same IST-day rule applies.
    if (row?.is_paused || row?.status === 'meeting') return NaN;
    const due = toMs(row?.disposition_due_at);
    if (!Number.isFinite(due) || nowMs < due) return NaN;
    if (istDateStr(new Date(due)) !== today) return NaN;
    from = due;
  }
  return from;
}

/**
 * Idle seconds for a live-status row, counting the still-open period.
 *
 * today_idle_seconds only holds COMMITTED time; while the FRO sits idle the
 * current period lives in idle_since (or is derivable from a lapsed deadline)
 * and is added on read, clamped to the shift window. That way a closed tab, a
 * crash or a powered-off monitor cannot lose the time — the row keeps the open
 * period until someone commits it.
 */
export function liveIdleSeconds(row, shift, nowMs = Date.now()) {
  const from = idlePeriodStartMs(row, nowMs);
  // An open period left over from a previous IST day must never be credited to
  // today: the committed total it would be added to belongs to yesterday.
  if (!Number.isFinite(from)) return Number(row?.today_idle_seconds || 0) || 0;
  const committed = istDateStr(new Date(from)) === istDateStr(new Date(nowMs))
    ? Number(row?.today_idle_seconds || 0) || 0
    : 0;
  const lo = Math.max(from, Number.isFinite(shift?.startMs) ? shift.startMs : -Infinity);
  const hi = Math.min(nowMs, Number.isFinite(shift?.endMs) ? shift.endMs : nowMs);
  return committed + (hi > lo ? Math.round((hi - lo) / 1000) : 0);
}

/**
 * Just the still-open idle period (no committed time), clamped to the shift.
 * This is what an admin needs for "how long has this person been sitting idle
 * right now" — distinct from the day total that includes earlier, banked
 * stretches. Returns 0 when there is no usable open period.
 */
export function openIdleSeconds(row, shift, nowMs = Date.now()) {
  const from = idlePeriodStartMs(row, nowMs);
  if (!Number.isFinite(from)) return 0;
  // A period left over from a previous IST day is stale, not "currently idle".
  if (istDateStr(new Date(from)) !== istDateStr(new Date(nowMs))) return 0;
  const lo = Math.max(from, Number.isFinite(shift?.startMs) ? shift.startMs : -Infinity);
  const hi = Math.min(nowMs, Number.isFinite(shift?.endMs) ? shift.endMs : nowMs);
  return hi > lo ? Math.round((hi - lo) / 1000) : 0;
}

/**
 * THE idle figure every read path must use. One definition, so the super-admin
 * live list, the NGO-admin board, the FRO's own strip and the dashboard alerts
 * cannot disagree about the same FRO at the same moment.
 *
 * `shift` is optional. Pass it wherever the FRO's own working hours are known,
 * so idle accrued outside the shift is not displayed as working-time idle.
 */
export function effectiveIdleSeconds(row, shift = null, nowMs = Date.now()) {
  return liveIdleSeconds(row, shift, nowMs);
}

/**
 * Fold any open idle period into today_idle_seconds and clear idle_since.
 * Returns the committed total (or null when the row had nothing to commit, so
 * callers can skip a pointless write).
 */
export function commitIdle(row, shift, nowMs = Date.now()) {
  const total = liveIdleSeconds(row, shift, nowMs);
  if (!row?.idle_since) return null;
  return total;
}

/**
 * Has the disposition deadline lapsed? A lapsed deadline means the FRO is idle
 * regardless of what the client claims.
 */
export function deadlinePassed(row, nowMs = Date.now()) {
  const due = toMs(row?.disposition_due_at);
  return Number.isFinite(due) && nowMs >= due;
}

/** Deadline for "now + one full window", or null outside the shift. */
export function nextDeadline(shift, nowMs = Date.now()) {
  if (!withinShift(shift, nowMs)) return null;
  return new Date(nowMs + DISPOSITION_WINDOW_SECONDS * 1000).toISOString();
}

export function dispositionDueMs(row) {
  return toMs(row?.disposition_due_at);
}

/**
 * Drop idle state left over from before the current shift, without writing to
 * the database.
 *
 * A row carries two kinds of stale value, and both make a worker look idle the
 * moment they sign in:
 *
 *  - an `idle_since` stamped on a previous IST day, and
 *  - a `disposition_due_at` older than this shift's start, which is always in
 *    the past by the time they log back in.
 *
 * The heartbeat already discarded both, but only when it ran. The login
 * hydrate did not, so signing in reported `is_idle: true` off yesterday's row
 * and the panel flashed the Resume overlay until the first heartbeat corrected
 * it. Readers must apply the same rule, so the logic lives here once.
 *
 * Returns a new object; the caller decides whether to persist.
 */
export function withoutStaleIdle(row, shift, nowMs = Date.now()) {
  if (!row) return row;
  const shiftStartMs = Number.isFinite(shift?.startMs) ? shift.startMs : NaN;
  const staleIdle = Number.isFinite(toMs(row.idle_since))
    && istDateStr(new Date(toMs(row.idle_since))) !== istDateStr(new Date(nowMs));
  const dueMs = toMs(row?.disposition_due_at);
  const staleDeadline = Number.isFinite(dueMs) && Number.isFinite(shiftStartMs) && dueMs < shiftStartMs;
  if (!staleIdle && !staleDeadline) return row;
  return {
    ...row,
    ...(staleIdle ? { idle_since: null, today_idle_seconds: 0 } : {}),
    ...(staleDeadline ? { disposition_due_at: null } : {}),
  };
}

export function secondsLeft(row, nowMs = Date.now()) {
  const due = dispositionDueMs(row);
  if (!Number.isFinite(due)) return null;
  return Math.max(0, Math.round((due - nowMs) / 1000));
}
