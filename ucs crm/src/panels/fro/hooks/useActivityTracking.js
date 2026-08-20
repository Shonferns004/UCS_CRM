import { useEffect, useRef, useCallback } from 'react';
import { api } from '../api/auth';

export function useActivityTracking(userId, options = {}) {
  const {
    idleThreshold = 15 * 60 * 1000, // 15 minutes
    heartbeatInterval = 30 * 1000,  // 30 seconds
    onIdle,
    onActive,
    onHeartbeat,
  } = options;

  const idleTimerRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const isIdleRef = useRef(false);
  const userIdRef = useRef(userId);

  userIdRef.current = userId;

  const resetIdleTimer = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;

    if (isIdleRef.current) {
      isIdleRef.current = false;
      onActive?.();
    }

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    idleTimerRef.current = setTimeout(() => {
      isIdleRef.current = true;
      onIdle?.();
    }, idleThreshold);
  }, [idleThreshold, onIdle, onActive]);

  const sendHeartbeat = useCallback(async () => {
    if (!userIdRef.current) return;
    
    try {
      const isIdle = isIdleRef.current;
      const status = isIdle ? 'idle' : 'online';
      
      await api('/fro/status', {
        method: 'PUT',
        body: JSON.stringify({
          status,
          last_activity_at: new Date().toISOString(),
        }),
        _prefix: 'ucs',
      });
      
      onHeartbeat?.({ status, isIdle });
    } catch (err) {
      console.error('Heartbeat failed:', err.message);
    }
  }, []);

  // Track user activity events
  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    
    const handleActivity = () => {
      resetIdleTimer();
    };

    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Initial timer
    resetIdleTimer();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  // Heartbeat timer
  useEffect(() => {
    sendHeartbeat(); // Initial
    
    heartbeatTimerRef.current = setInterval(sendHeartbeat, heartbeatInterval);
    
    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    };
  }, [heartbeatInterval, sendHeartbeat]);

  // Handle page visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page hidden - could pause heartbeat or adjust
      } else {
        // Page visible - send immediate heartbeat
        resetIdleTimer();
        sendHeartbeat();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [resetIdleTimer, sendHeartbeat]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    };
  }, []);

  return {
    isIdle: isIdleRef.current,
    lastActivity: lastActivityRef.current,
    resetIdleTimer,
    sendHeartbeat,
  };
}

export default useActivityTracking;