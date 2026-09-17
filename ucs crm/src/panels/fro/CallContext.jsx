import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { api } from './api/auth'
import { useActivityTracking } from './hooks/useActivityTracking'
import { istDateString } from './utils/time'
import { useMeeting } from '../../meetingStore'
import { onFroResetIdle } from '../../lib/socket'

const CallContext = createContext()

const BREAK_LIMIT = 3600

const ZERO_STATS = { calls: 0, totalSeconds: 0, skippedDonors: 0, idleSeconds: 0, breakSeconds: 0, breakCount: 0 }

function fmt(seconds) {
  if (seconds == null) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Short attention chime for the first idle alert of a streak (best effort —
// browsers may block audio until a user gesture, the popup still shows).
function playAlertBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9)
    osc.start()
    osc.stop(ctx.currentTime + 0.95)
    setTimeout(() => { try { ctx.close() } catch {} }, 1200)
  } catch { /* audio unavailable — popup is the alert */ }
}

// Blocking popup shown while the FRO is call-idle. Sound plays on the first
// alert only; snoozing hides it for 5 minutes and it re-appears (silently)
// while idle continues. Mouse activity or real call activity dismisses it when
// the other inactivity condition is also clear.
const IdleAlertPopup = ({ callIdleSince, resetCallActivity }) => {
  const [now, setNow] = useState(Date.now())
  const [visible, setVisible] = useState(true)
  const snoozeTimerRef = useRef(null)

  useEffect(() => {
    playAlertBeep() // first alert only — remounts only after real activity
  }, [])

  // Live "Idle for X min" ticker
  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const t = setInterval(tick, 15000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    return () => { if (snoozeTimerRef.current) clearTimeout(snoozeTimerRef.current) }
  }, [])

  const snooze = () => {
    setVisible(false)
    snoozeTimerRef.current = setTimeout(() => setVisible(true), 5 * 60 * 1000)
  }

  const minutesIdle = callIdleSince
    ? Math.max(0, Math.floor((now - new Date(callIdleSince).getTime()) / 60000))
    : 0

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99994,
      background: 'rgba(15,23,42,.7)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 8,
    }}>
      <div style={{
        width: 'min(420px, 100%)',
        borderRadius: 18, background: '#fff', boxShadow: '0 24px 60px rgba(0,0,0,.4)',
        padding: 20,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
        }}>
          <span style={{
            width: 30, height: 30, borderRadius: 9, background: '#f87171',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(248,113,113,.3)',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </span>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#dc2626' }}>You are idle</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>Idle for</span>
          <span style={{ fontSize: 22, color: '#dc2626', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {minutesIdle} min
          </span>
        </div>

        <div style={{ marginBottom: 16, fontSize: 13, fontWeight: 600, color: '#d97706' }}>
          No mouse movement or call activity for over 5 minutes. Please resume calling donors.
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={resetCallActivity}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none',
              background: '#16a34a', color: '#fff', fontWeight: 600, fontSize: 13,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Resume calling
          </button>
          <button
            onClick={snooze}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none',
              background: '#f59e0b', color: '#fff', fontWeight: 600, fontSize: 13,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Snooze 5m
          </button>
        </div>

        <div style={{ marginTop: 12, fontSize: 11, color: '#9ca3af' }}>
          This alert re-appears every 5 minutes while you remain idle. Making a call, saving a disposition, or ending a break dismisses it immediately.
        </div>
      </div>
    </div>
  )
}

export function CallProvider({ children, userId }) {
  const [activeCall, setActiveCall] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef(null)
  const [todayStats, setTodayStats] = useState(ZERO_STATS)
  const donorViewStartRef = useRef(null)
  const lastDonorIdRef = useRef(null)
  const [onBreak, setOnBreak] = useState(false)
  const [breakElapsed, setBreakElapsed] = useState(0)
  const breakTimerRef = useRef(null)

  // Company-wide meeting mode: freezes every live counter while active.
  const meeting = useMeeting()
  const meetingActive = !!meeting
  const meetingActiveRef = useRef(false); meetingActiveRef.current = meetingActive
  // Wall-clock frozen while the meeting is active (null when not in a meeting).
  const meetingStartRef = useRef(null)
  // Paused milliseconds accumulated for the CURRENT call / break (per cycle).
  const callPausedMsRef = useRef(0)
  const breakPausedMsRef = useRef(0)
  const breakStartRef = useRef(null) // when the current break started

  // Refs mirroring state so syncAllStats stays stable and always reads fresh values
  const activeCallRef = useRef(null); activeCallRef.current = activeCall
  const onBreakRef = useRef(false); onBreakRef.current = onBreak
  const todayStatsRef = useRef(todayStats); todayStatsRef.current = todayStats
  // Start of the current idle streak (ISO), set by the call-idle engine
  const callIdleSinceRef = useRef(null)

  const clearTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }
  const clearBreakTimer = () => { if (breakTimerRef.current) { clearInterval(breakTimerRef.current); breakTimerRef.current = null } }

  const totalBreakWithCurrent = todayStats.breakSeconds + (onBreak ? breakElapsed : 0)
  const isBreakOvertime = totalBreakWithCurrent > BREAK_LIMIT

  // Stats are server-authoritative: the client keeps today's counters in memory
  // only (never localStorage) and pushes them on every change. statsOverride lets
  // a caller push a freshly-computed value before React re-renders the ref.
  const syncAllStats = useCallback((extra = {}, statsOverride = null) => {
    const stats = statsOverride || todayStatsRef.current
    const status = meetingActiveRef.current ? 'meeting'
      : (onBreakRef.current ? 'break'
        : (activeCallRef.current ? 'on_call'
          : (callIdleSinceRef.current ? 'idle' : 'online')))
    api('/fro/status', {
      method: 'PUT',
      body: JSON.stringify({
        status,
        current_donor_name: activeCallRef.current?.donorName || null,
        current_donor_id: activeCallRef.current?.donorId || null,
        today_calls: stats.calls,
        today_talk_seconds: stats.totalSeconds,
        today_skipped: stats.skippedDonors,
        today_idle_seconds: stats.idleSeconds,
        today_break_seconds: stats.breakSeconds,
        on_break: onBreakRef.current,
        ...extra,
      }),
    }).catch((err) => { console.error('Error:', err.message); })
  }, [])

  // Update todayStats in memory (merge or replace) + push it to the server.
  const commitTodayStats = useCallback((next, extra = {}, opts = {}) => {
    const merged = opts.replace ? next : { ...todayStatsRef.current, ...next }
    todayStatsRef.current = merged
    setTodayStats(merged)
    syncAllStats(extra, merged)
  }, [syncAllStats])

  // Seed today's counters (used on panel load — no localStorage anymore).
  const hydrateTodayStats = useCallback((next) => {
    todayStatsRef.current = next
    setTodayStats(next)
  }, [])

// ---------- Combined mouse/call idle engine (5 min) ----------
  const { isCallIdle, callIdleSince, resetCallActivity, sendHeartbeat } = useActivityTracking(userId, {
    callIdleThreshold: 5 * 60 * 1000,
    // Breaks, live calls, open donor views and meeting mode are exempt from idle detection
    isExempt: () => meetingActiveRef.current || onBreakRef.current || activeCallRef.current != null || donorViewStartRef.current != null,
    onCallIdle: (sinceIso) => {
      callIdleSinceRef.current = sinceIso
      syncAllStats({ status: 'idle', idle_since: sinceIso })
    },
    onCallResume: () => {
      const since = callIdleSinceRef.current
      callIdleSinceRef.current = null
      if (since) {
        const idleSecs = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000))
        if (idleSecs > 0) {
          commitTodayStats({ ...todayStatsRef.current, idleSeconds: todayStatsRef.current.idleSeconds + idleSecs })
        }
      }
      syncAllStats({ idle_since: null })
    },
    // Combined activity callbacks own backend status updates. The legacy
    // browser-idle callbacks are intentionally no-ops to avoid an online
    // heartbeat racing the idle status update.
    onIdle: () => {},
    onActive: () => {},
  })

  // ---------- Meeting mode: freeze every counter ----------
  useEffect(() => {
    if (meetingActive) {
      meetingStartRef.current = Date.now()
      // Close any open idle streak counting only up to the meeting start, so
      // meeting time never becomes idle time.
      if (callIdleSinceRef.current) {
        const since = callIdleSinceRef.current
        const idleSecs = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000))
        callIdleSinceRef.current = null
        if (idleSecs > 0) {
          commitTodayStats({ ...todayStatsRef.current, idleSeconds: todayStatsRef.current.idleSeconds + idleSecs })
        }
        syncAllStats({ idle_since: null })
      }
      resetCallActivity()
      syncAllStats({ idle_since: null })
    } else {
      // Meeting over — accrue the paused window once, then resume normally.
      if (meetingStartRef.current) {
        const paused = Date.now() - meetingStartRef.current
        callPausedMsRef.current += paused
        breakPausedMsRef.current += paused
        meetingStartRef.current = null
      }
      resetCallActivity() // fresh idle streak starts post-meeting, no meeting seconds
      syncAllStats()
    }
  }, [meetingActive, syncAllStats, resetCallActivity])

  // ---------- Stats sync & status transitions ----------
  useEffect(() => {
    if (!localStorage.getItem('ucs_token')) return
    let cancelled = false
    // No localStorage anymore: hydrate today's counters from the server (same IST
    // day only — a new day starts at zero), then announce online/status.
    ;(async () => {
      try {
        const live = await api('/fro/status/me', { _prefix: 'ucs' })
        if (cancelled || !live) return
        const serverDay = istDateString(live.updated_at || new Date().toISOString())
        if (serverDay === istDateString()) {
          hydrateTodayStats({
            calls: live.today_calls || 0,
            totalSeconds: live.today_talk_seconds || 0,
            skippedDonors: live.today_skipped || 0,
            idleSeconds: live.today_idle_seconds || 0,
            breakSeconds: live.today_break_seconds || 0,
            breakCount: 0,
          })
        }
      } catch (e) {
        console.error('Error:', e.message)
      } finally {
        if (!cancelled) syncAllStats()
      }
    })()
    return () => {
      cancelled = true
      if (!localStorage.getItem('ucs_token')) return
      api('/fro/status', { method: 'PUT', body: JSON.stringify({ status: 'offline' }) }).catch(() => {})
    }
  }, [hydrateTodayStats, syncAllStats])

  // Admin "Clear Idle Time": the backend zeroed today_idle_seconds server-side
  // and broadcast fro:reset-idle. Mirror it in memory so the UI matches.
  useEffect(() => {
    if (!localStorage.getItem('ucs_token')) return undefined
    return onFroResetIdle(() => {
      callIdleSinceRef.current = null
      const next = { ...todayStatsRef.current, idleSeconds: 0 }
      todayStatsRef.current = next
      setTodayStats(next)
      syncAllStats({ idle_since: null })
    })
  }, [syncAllStats])

  // New IST day while the panel is open: roll today's counters back to 0 so the
  // heartbeat never carries yesterday's totals into the new day's fro_daily_stats
  // row (which is upserted with GREATEST and would otherwise keep them forever).
  useEffect(() => {
    if (!localStorage.getItem('ucs_token')) return undefined
    let day = istDateString()
    const timer = setInterval(() => {
      const now = istDateString()
      if (now === day) return
      day = now
      callIdleSinceRef.current = null
      const next = { calls: 0, totalSeconds: 0, skippedDonors: 0, idleSeconds: 0, breakSeconds: 0, breakCount: 0 }
      todayStatsRef.current = next
      setTodayStats(next)
      syncAllStats({ idle_since: null }, next)
    }, 30 * 1000)
    return () => clearInterval(timer)
  }, [syncAllStats])

  // Push status whenever it changes (call started/ended, break toggled)
  useEffect(() => {
    if (!localStorage.getItem('ucs_token')) return
    syncAllStats()
  }, [activeCall, onBreak, syncAllStats])

  useEffect(() => {
    if (activeCall) {
      clearBreakTimer()
      timerRef.current = setInterval(() => {
        const nowClock = Date.now()
        const paused = callPausedMsRef.current + (meetingStartRef.current ? nowClock - meetingStartRef.current : 0)
        setElapsed(Math.max(0, Math.floor((nowClock - activeCall.startTime - paused) / 1000)))
      }, 1000)
      return clearTimer
    } else {
      setElapsed(0)
      callPausedMsRef.current = 0
    }
  }, [activeCall])

  useEffect(() => {
    if (onBreak) {
      clearTimer()
      breakStartRef.current = Date.now()
      breakTimerRef.current = setInterval(() => {
        const nowClock = Date.now()
        const paused = breakPausedMsRef.current + (meetingStartRef.current ? nowClock - meetingStartRef.current : 0)
        setBreakElapsed(Math.max(0, Math.floor((nowClock - breakStartRef.current - paused) / 1000)))
      }, 1000)
      return clearBreakTimer
    } else {
      setBreakElapsed(0)
      breakPausedMsRef.current = 0
      breakStartRef.current = null
    }
  }, [onBreak])

  const startDonorView = useCallback((donorId) => {
    donorViewStartRef.current = Date.now()
    lastDonorIdRef.current = donorId
  }, [])

  const endDonorView = useCallback((wasCalled) => {
    const start = donorViewStartRef.current
    if (!start) return
    const elapsedView = Math.floor((Date.now() - start) / 1000)
    // Meeting mode freezes all counters — a donor view during a meeting counts
    // as neither a skip nor idle time.
    if (!meetingActiveRef.current && !wasCalled && elapsedView >= 3) {
      commitTodayStats({
        skippedDonors: todayStatsRef.current.skippedDonors + 1,
        idleSeconds: todayStatsRef.current.idleSeconds + elapsedView,
      })
    }
    donorViewStartRef.current = null
    resetCallActivity() // donor reviewed → counts as activity
  }, [resetCallActivity])

  const toggleBreak = useCallback(() => {
    if (onBreak) {
      commitTodayStats({
        breakSeconds: todayStatsRef.current.breakSeconds + breakElapsed,
        breakCount: todayStatsRef.current.breakCount + 1,
      })
      setOnBreak(false)
      setBreakElapsed(0)
      resetCallActivity() // break ended → idle timer restarts
    } else {
      setOnBreak(true)
      setBreakElapsed(0)
      resetCallActivity() // break started → clear any live idle streak
    }
  }, [onBreak, breakElapsed, resetCallActivity])

  const startCall = useCallback((donor) => {
    if (onBreak) toggleBreak()
    donorViewStartRef.current = null
    setActiveCall({
      donorId: donor.id || donor.donorId,
      donorName: donor.donor_name || donor.donorName,
      donorMobile: donor.donor_mobile || donor.donorMobile,
      startTime: Date.now(),
    })
    resetCallActivity() // calling resets the idle timer
  }, [onBreak, toggleBreak, resetCallActivity])

  const endCall = useCallback(() => {
    if (activeCall) {
      const nowClock = Date.now()
      // Meeting time is excluded: only talk time outside the meeting counts.
      const paused = callPausedMsRef.current + (meetingStartRef.current ? nowClock - meetingStartRef.current : 0)
      const duration = Math.max(0, Math.floor((nowClock - activeCall.startTime - paused) / 1000))
      if (duration > 0) {
        commitTodayStats({
          calls: todayStatsRef.current.calls + 1,
          totalSeconds: todayStatsRef.current.totalSeconds + duration,
        })
      }
    }
    setActiveCall(null)
    resetCallActivity() // call ended → idle timer restarts
  }, [activeCall, resetCallActivity])

  return (
    <CallContext.Provider value={{
      activeCall, elapsed, todayStats, startCall, endCall, isOnCall: !!activeCall,
      startDonorView, endDonorView, syncAllStats, fmt,
      onBreak, breakElapsed, toggleBreak, isBreakOvertime, BREAK_LIMIT,
      isCallIdle, resetCallActivity, sendHeartbeat,
    }}>
      {children}
      {isCallIdle && !meetingActive && (
        <IdleAlertPopup
          callIdleSince={callIdleSince}
          resetCallActivity={resetCallActivity}
        />
      )}
    </CallContext.Provider>
  )
}

export function useCall() {
  const ctx = useContext(CallContext)
  if (!ctx) throw new Error('useCall must be used within CallProvider')
  return ctx
}
