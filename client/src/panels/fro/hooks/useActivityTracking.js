import { useEffect, useRef, useCallback, useState } from 'react';

export function useActivityTracking(userId, options = {}) {
  const {
    idleThreshold = 6 * 60 * 1000, // 6 minutes without mouse activity
    onIdle,
    onActive,
    callIdleThreshold = 6 * 60 * 1000, // 6 minutes without call activity
    onCallIdle,
    onCallResume,
    isExempt, // () => boolean — true while on a call, on break, in a meeting, or paused
  } = options;

  const idleTimerRef = useRef(null);
  // Time of the last mouse-driven activity (drives the mouse side of the AND rule).
  const lastActivityRef = useRef(Date.now());
  // Time of the last donor/call/disposition activity (drives the call side).
  const lastCallActivityRef = useRef(Date.now());
  // Mouse side of the AND rule: true once 6 min pass with no mouse movement.
  const isMouseIdleRef = useRef(false);
  // Open idle streak: both sides idle for the threshold and not exempt.
  const isCallIdleRef = useRef(false);
  const [isCallIdle, setIsCallIdle] = useState(false);
  const [callIdleSince, setCallIdleSince] = useState(null); // ISO string
  const userIdRef = useRef(userId);

  userIdRef.current = userId;

  // Callbacks live in a ref so timers stay stable and always call fresh closures
  const cbsRef = useRef({});
  cbsRef.current = { onIdle, onActive, onCallIdle, onCallResume, isExempt };

  // Close an open idle streak and hand the elapsed time to onCallResume so the
  // context can book it.
  const closeCallIdle = useCallback(() => {
    if (!isCallIdleRef.current) return
    isCallIdleRef.current = false
    setIsCallIdle(false)
    setCallIdleSince(null)
    cbsRef.current.onCallResume?.()
  }, [])

  // AND rule: idle opens only when BOTH sides have been quiet for the threshold
  // AND the caller is not exempt. Opening a donor view resets the call side, so
  // it grants a fresh 6-minute grace but does NOT suspend the timer beyond that.
  const tryOpenCallIdle = useCallback(() => {
    if (isCallIdleRef.current) return
    if (cbsRef.current.isExempt?.()) return
    if (!isMouseIdleRef.current) return
    if (Date.now() - lastCallActivityRef.current <= callIdleThreshold) return
    isCallIdleRef.current = true
    const since = new Date().toISOString()
    setCallIdleSince(since)
    setIsCallIdle(true)
    cbsRef.current.onCallIdle?.(since)
  }, [callIdleThreshold])

  // ---------- Mouse-idle timer ----------
  // Mouse movement refreshes the "no mouse" side of the AND rule so a FUTURE
  // streak needs a fresh 6 quiet minutes, but it NEVER ends an open idle streak:
  // only real work ends idle (donor/call/disposition via resetCallActivity, or
  // the explicit "I'm back" resume). Otherwise flicking the mouse every few
  // minutes would keep clearing the accrued "Idle Xm".
  const resetIdleTimer = useCallback(() => {
    lastActivityRef.current = Date.now()

    if (isMouseIdleRef.current) {
      isMouseIdleRef.current = false
    }

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
    }

    idleTimerRef.current = setTimeout(() => {
      isMouseIdleRef.current = true
      cbsRef.current.onIdle?.()
      // Mouse side elapsed — the AND rule still needs the call side.
      tryOpenCallIdle()
    }, idleThreshold);
  }, [idleThreshold, tryOpenCallIdle])

  // Donor/call work: resets the "no call activity" side and closes any open
  // streak (any kind of activity ends idle). Grace is NOT counted — a streak
  // starts from the moment the warning fires, not backdated to the last event.
  const resetCallActivity = useCallback(() => {
    lastCallActivityRef.current = Date.now()
    closeCallIdle()
  }, [closeCallIdle])

  // Check every 15 seconds and open the idle streak the moment both sides have
  // been quiet for the threshold. Fires onCallIdle exactly once per streak.
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

  // ---------- Mouse activity listeners ----------
  useEffect(() => {
    const events = ['mousemove'];

    const handleActivity = () => {
      resetIdleTimer();
    };

    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    resetIdleTimer();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  // Presence is socket-based now (server tracks the open connection) — no
  // timer pings. Refocusing a tab only resets the local idle timer; real
  // state changes still push to the server via CallContext.syncAllStats.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) resetIdleTimer();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [resetIdleTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  return {
    isIdle: isMouseIdleRef.current,
    isCallIdle,
    callIdleSince,
    lastActivity: lastActivityRef.current,
    lastCallActivity: lastCallActivityRef.current,
    resetIdleTimer,
    resetCallActivity,
  };
}

export default useActivityTracking;