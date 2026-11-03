// Timing rules for a punch request.
//
// Offline punches are queued on the device and replayed when the network
// returns, so the request can arrive hours — or a whole day — after the worker
// scanned the QR. The client sends that moment as `punch_time`; without it a
// replayed punch is stamped with the sync time AND the sync day, which is how
// an evening sync turned a morning punch-in into "punched in and out at 19:xx".

export const PUNCH_TIME_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // a week
export const PUNCH_TIME_MAX_FUTURE_MS = 10 * 60 * 1000; // 10 min clock skew

// Turn the client's `punch_time` into the instant to record.
//   - missing / unparseable -> now (a live punch)
//   - clock ahead           -> now (a future punch is meaningless)
//   - older than a week     -> error: a stale queued punch must not silently
//                              mark someone present days later
export function resolvePunchTime(raw, now = new Date()) {
  if (raw === undefined || raw === null || raw === '') return { time: now };

  let parsed = null;
  if (raw instanceof Date) {
    parsed = raw;
  } else if (typeof raw === 'number') {
    // Accept epoch seconds as well as milliseconds.
    parsed = new Date(raw < 1e12 ? raw * 1000 : raw);
  } else {
    const s = String(raw).trim();
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      parsed = new Date(s.length <= 10 ? n * 1000 : n);
    } else {
      parsed = new Date(s);
    }
  }
  if (!parsed || Number.isNaN(parsed.getTime())) return { time: now };

  const t = parsed.getTime();
  if (t > now.getTime() + PUNCH_TIME_MAX_FUTURE_MS) return { time: now };
  if (t < now.getTime() - PUNCH_TIME_MAX_AGE_MS) {
    return { error: 'Punch time is older than 7 days and can no longer be recorded' };
  }
  return { time: parsed };
}
