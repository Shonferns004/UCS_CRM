import { useCallback, useRef, useState } from 'react';
import { useIdleTimer } from 'react-idle-timer';

// Work-based idle detection via react-idle-timer (v5).
// Idle means no donor/call/disposition WORK for callIdleThreshold ms — NOT no
// raw input. Mouse movement / typing are deliberately ignored: only the
// 'fro-work' event resets the timer, dispatched from resetCallActivity() on
// every real work action (opening a donor, calling, saving a disposition...).
// Opening a donor view therefore grants a fresh 4-minute grace but does not
// suspend detection beyond that, exactly as before.
//
// Multi-tab: crossTab + leaderElection replicate activity and idle across all
// open tabs of this worker (per-user channel name), and only the leader tab
// opens/book s the streak — so a duplicate/stale tab can neither claim idle
// while a real tab works, nor double-book when nobody is active. This replaces
// the old localStorage timestamps + 60s/90s grace algorithm.
//
// The hook interface is unchanged: { isCallIdle, callIdleSince, resetCallActivity }.
const WORK_EVENT = 'fro-work';

const dispatchWork = () => {
  try { document.dispatchEvent(new CustomEvent(WORK_EVENT)) } catch (_) {}
};

export function useActivityTracking(userId, options = {}) {
  const {
    callIdleThreshold = 4 * 60 * 1000, // 4 minutes without donor/call/disposition work
    onCallIdle,
    onCallResume,
    isExempt, // () => boolean — true while on a call, on break, in a meeting, or paused
  } = options;

  const [isCallIdle, setIsCallIdle] = useState(false);
  const [callIdleSince, setCallIdleSince] = useState(null); // ISO string
  const isCallIdleRef = useRef(false);
  isCallIdleRef.current = isCallIdle;

  // Callbacks live in a ref so handlers stay stable and always read fresh closures
  const cbsRef = useRef({});
  cbsRef.current = { onCallIdle, onCallResume, isExempt };

  const openIdle = useCallback((sinceIso) => {
    isCallIdleRef.current = true
    setIsCallIdle(true)
    setCallIdleSince(sinceIso)
    cbsRef.current.onCallIdle?.(sinceIso)
  }, [])

  const closeIdle = useCallback(() => {
    if (!isCallIdleRef.current) return
    isCallIdleRef.current = false
    setIsCallIdle(false)
    setCallIdleSince(null)
    cbsRef.current.onCallResume?.()
  }, [])

  const idleTimer = useIdleTimer({
    timeout: callIdleThreshold,
    events: [WORK_EVENT],
    startOnMount: true,
    stopOnIdle: false,
    disabled: !userId,
    crossTab: true,
    leaderElection: true,
    name: `fro-activity:${userId || 'anon'}`,
    onIdle: (_, timer) => {
      // Exempt states (call/break/meeting/pause) never idle: re-arm the timer
      // instead of opening a streak — same behaviour as the old periodic check.
      if (cbsRef.current.isExempt?.()) {
        timer.reset()
        return
      }
      // Only the cross-tab leader opens/blocks the streak so duplicate tabs
      // can never double-book the same idle window.
      if (timer.isLeader()) {
        openIdle(new Date().toISOString())
      }
    },
    onActive: () => {
      // Any work event after idle closes the streak on the leader (the tab
      // that opened it). Followers never opened one, so this is a no-op there.
      closeIdle()
    },
    onAction: () => {},
  })

  // Donor/call work: announce the activity and reset the "no work" timer via the
  // 'fro-work' event (also replicated cross-tab, clearing idle on every tab of
  // this worker). If an idle streak is open, the library transitions idle ->
  // active and onActive commits it through onCallResume.
  const resetCallActivity = useCallback(() => {
    dispatchWork()
  }, [])

  return {
    isCallIdle,
    callIdleSince,
    resetCallActivity,
  };
}

export default useActivityTracking;