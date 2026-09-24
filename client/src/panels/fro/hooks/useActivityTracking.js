import { useEffect, useRef, useCallback, useState } from 'react';

// Multi-tab guard: an FRO working in one tab (opening donors, calling) must not
// show idle because an older duplicate tab still runs its own 4-minute timer
// and keeps pushing status 'idle'. Every tab stamps a localStorage activity
// marker on real work; 'storage' events surface it in the OTHER tabs, which then
// refuse to open an idle streak while another tab has been active in the last
// OTHER_TAB_GRACE ms. A mounted non-idle tab also re-stamps every BUSY_INTERVAL
// ms so a long call / open-record stint never lets a stale tab claim idle.
const ACTIVITY_KEY = 'ucs_fro_activity';
const BUSY_INTERVAL = 60 * 1000;
const OTHER_TAB_GRACE = 90 * 1000;

const stampActivity = () => {
  try { localStorage.setItem(ACTIVITY_KEY, String(Date.now())) } catch (_) {}
};

export function useActivityTracking(userId, options = {}) {
  const {
    callIdleThreshold = 4 * 60 * 1000, // 4 minutes without donor/call/disposition work
    onCallIdle,
    onCallResume,
    isExempt, // () => boolean — true while on a call, on break, in a meeting, or paused
  } = options;

  // Time of the last donor/call/disposition activity (drives the idle timer).
  const lastCallActivityRef = useRef(Date.now());
  // Latest activity another open tab of this worker reported (see the multi-tab
  // guard above). 0 = none seen (single-tab case, idle works as normal).
  const otherTabActiveAtRef = useRef(0);
  // Open idle streak: no work for the threshold and not exempt.
  const isCallIdleRef = useRef(false);
  const [isCallIdle, setIsCallIdle] = useState(false);
  const [callIdleSince, setCallIdleSince] = useState(null); // ISO string
  const userIdRef = useRef(userId);

  userIdRef.current = userId;

  // Callbacks live in a ref so timers stay stable and always call fresh closures
  const cbsRef = useRef({});
  cbsRef.current = { onCallIdle, onCallResume, isExempt };

  // Close an open idle streak and hand the elapsed time to onCallResume so the
  // context can book it.
  const closeCallIdle = useCallback(() => {
    if (!isCallIdleRef.current) return
    isCallIdleRef.current = false
    setIsCallIdle(false)
    setCallIdleSince(null)
    cbsRef.current.onCallResume?.()
  }, [])

  // Idle opens when no donor/call/disposition work happened for the threshold
  // AND the caller is not exempt — regardless of mouse movement or which page /
  // modal is open. Opening a donor view resets the timer, granting a fresh
  // 4-minute grace, but does NOT suspend it beyond that. A streak is also
  // suppressed while another open tab reported activity recently (multi-tab
  // guard) so a working FRO is never painted idle by a stale duplicate tab.
  const tryOpenCallIdle = useCallback(() => {
    if (isCallIdleRef.current) return
    if (cbsRef.current.isExempt?.()) return
    if (Date.now() - otherTabActiveAtRef.current < OTHER_TAB_GRACE) return
    if (Date.now() - lastCallActivityRef.current <= callIdleThreshold) return
    isCallIdleRef.current = true
    const since = new Date().toISOString()
    setCallIdleSince(since)
    setIsCallIdle(true)
    cbsRef.current.onCallIdle?.(since)
  }, [callIdleThreshold])

  // Donor/call work: resets the "no work" timer, announces this tab as active to
  // the other open tabs, and closes any open streak (any kind of activity ends
  // idle). Grace is NOT counted — a streak starts from the moment the warning
  // fires, not backdated to the last event.
  const resetCallActivity = useCallback(() => {
    lastCallActivityRef.current = Date.now()
    stampActivity()
    closeCallIdle()
  }, [closeCallIdle])

  // While this tab is NOT idle it re-stamps the activity marker every minute, so
  // a stale duplicate tab cannot open an idle streak mid-call or while a single
  // record stays open. Once this tab genuinely idles it stops stamping and the
  // guard no longer blocks it.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isCallIdleRef.current) stampActivity()
    }, BUSY_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  // Surface activity written by other tabs of this worker (fires only in the
  // OTHER tabs — never in the tab that wrote the marker).
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== ACTIVITY_KEY || e.newValue == null) return
      const t = Number(e.newValue)
      if (Number.isFinite(t) && t > otherTabActiveAtRef.current) otherTabActiveAtRef.current = t
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Check every 15 seconds and open the idle streak the moment work has been
  // quiet for the threshold. Fires onCallIdle exactly once per streak.
  const checkCallIdle = useCallback(() => {
    if (!userIdRef.current) return
    if (cbsRef.current.isExempt?.()) {
      closeCallIdle() // defensive: break/meeting/pause/call must never idle
      return
    }
    tryOpenCallIdle()
  }, [tryOpenCallIdle, closeCallIdle])

  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(checkCallIdle, 15000);
    return () => clearInterval(interval);
  }, [userId, checkCallIdle]);

  return {
    isCallIdle,
    callIdleSince,
    lastCallActivity: lastCallActivityRef.current,
    resetCallActivity,
  };
}

export default useActivityTracking;