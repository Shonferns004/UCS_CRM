import { useEffect, useRef, useCallback, useState } from 'react';

export function useActivityTracking(userId, options = {}) {
  const {
    idleThreshold = 6 * 60 * 1000, // 6 minutes without mouse activity
    onIdle,
    onActive,
    callIdleThreshold = 6 * 60 * 1000, // 6 minutes without call activity
    onCallIdle,
    onCallResume,
    isExempt, // () => boolean — true while on a call, on break, or in a donor view
  } = options;

  const idleTimerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const isIdleRef = useRef(false);
  const userIdRef = useRef(userId);

  userIdRef.current = userId;

  // Callbacks live in a ref so timers stay stable and always call fresh closures
  const cbsRef = useRef({});
  cbsRef.current = { onIdle, onActive, onCallIdle, onCallResume, isExempt };

  // ---------- Mouse-idle timer ----------
  // Mouse inactivity is one side of the OR-based idle rule.
  const resetIdleTimer = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;

    if (isIdleRef.current) {
      isIdleRef.current = false;
      if (!callIdleConditionRef.current) {
        isCallIdleRef.current = false;
        setIsCallIdle(false);
        setCallIdleSince(null);
        cbsRef.current.onCallResume?.();
      }
      cbsRef.current.onActive?.();
    }

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    idleTimerRef.current = setTimeout(() => {
      isIdleRef.current = true;
      cbsRef.current.onIdle?.();
      if (!isCallIdleRef.current && !cbsRef.current.isExempt?.()) {
        // Grace period is NOT counted: the streak starts when the warning
        // fires (now), not backdated to the last mouse movement.
        cbsRef.current.onCallIdle?.(new Date().toISOString());
      }
    }, idleThreshold);
  }, [idleThreshold]);

  // ---------- Call-idle engine ----------
  // Call inactivity is the other side of the OR-based idle rule. Mouse
  // activity does not reset this timer.
  const lastCallActivityRef = useRef(Date.now());
  const callIdleConditionRef = useRef(false);
  const isCallIdleRef = useRef(false);
  const [isCallIdle, setIsCallIdle] = useState(false);
  const [callIdleSince, setCallIdleSince] = useState(null); // ISO string

  const resetCallActivity = useCallback(() => {
    lastCallActivityRef.current = Date.now();
    callIdleConditionRef.current = false;
    if (isCallIdleRef.current && !isIdleRef.current && !callIdleConditionRef.current) {
      isCallIdleRef.current = false;
      setIsCallIdle(false);
      setCallIdleSince(null);
      cbsRef.current.onCallResume?.();
    }
  }, []);

  // Check every 15 seconds. Fires onCallIdle exactly once per idle streak.
  const checkCallIdle = useCallback(() => {
    if (!userIdRef.current) return;
    if (cbsRef.current.isExempt?.()) return; // on call / on break / in donor view
    const elapsed = Date.now() - lastCallActivityRef.current;
    if (elapsed > callIdleThreshold) {
      callIdleConditionRef.current = true;
      if (!isCallIdleRef.current) {
        isCallIdleRef.current = true;
        // Grace period is NOT counted: the streak starts when the warning
        // fires (now), not backdated to the last call activity.
        const since = new Date().toISOString();
        setCallIdleSince(since);
        setIsCallIdle(true);
        cbsRef.current.onCallIdle?.(since);
      }
    } else {
      // Safety net (e.g. clock jump) — normal clears go through resetCallActivity
      callIdleConditionRef.current = false;
      if (isCallIdleRef.current && !isIdleRef.current) {
        isCallIdleRef.current = false;
        setIsCallIdle(false);
        setCallIdleSince(null);
        cbsRef.current.onCallResume?.();
      }
    }
  }, [callIdleThreshold]);

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
    isIdle: isIdleRef.current,
    isCallIdle,
    callIdleSince,
    lastActivity: lastActivityRef.current,
    lastCallActivity: lastCallActivityRef.current,
    resetIdleTimer,
    resetCallActivity,
  };
}

export default useActivityTracking;
