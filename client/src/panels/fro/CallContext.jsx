import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { api } from './api/auth'
import { istDateString } from './utils/time'
import { useMeeting } from '../../meetingStore'
import { onSocketConnect, onFroPause, onFroResume, onDbChange } from '../../lib/socket'

const CallContext = createContext()

// Mirrors DISPOSITION_WINDOW_SECONDS on the server. The server is authoritative —
// this only seeds the chip before the first heartbeat answers.
export const DISPOSITION_WINDOW = 240

const ZERO_STATS = { calls: 0, totalSeconds: 0 }

function fmt(seconds) {
  if (seconds == null) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function CallProvider({ children, userId, operatorId }) {
  const [activeCall, setActiveCall] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef(null)
  const [todayStats, setTodayStats] = useState(ZERO_STATS)
  const lastDonorIdRef = useRef(null)
  const [liveStatus, setLiveStatus] = useState('online')

  // ── Disposition timer ────────────────────────────────────────
  // The FRO gets 4 minutes from their first action of the day, and 4 more after
  // every disposition. When it runs out they are idle until they record
  // something or press Resume. All of that is decided on the server; these
  // values are its answers, mirrored so the chip and banner can render.
  const [dispositionDueAt, setDispositionDueAt] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(null)
  const [isIdle, setIsIdle] = useState(false)
  const [idleSecondsToday, setIdleSecondsToday] = useState(0)
  const [inShift, setInShift] = useState(true)
  // Mirrored into a ref so the 1s countdown tick can read it without being
  // torn down and rebuilt on every shift-boundary change.
  const inShiftRef = useRef(true); inShiftRef.current = inShift
  const dispositionDueRef = useRef(null); dispositionDueRef.current = dispositionDueAt
  const isIdleRef = useRef(false); isIdleRef.current = isIdle
  // The server's own answer, "you have N seconds left", plus the local monotonic
  // reading taken when that answer arrived. The countdown is N minus locally
  // elapsed time. It is deliberately NOT deadline-minus-Date.now(): plenty of
  // field laptops have a wrong system clock, and comparing a server timestamp
  // against a skewed local one pinned the display at 0:00 and made a freshly
  // reset 4-minute window look like it had not reset at all. performance.now()
  // only ever measures elapsed time on this machine, so a wrong clock cannot
  // affect it.
  const serverSecondsRef = useRef(null)

  // The server flipped us idle between heartbeats; push one so the row records
  // the transition (and idle_since) without waiting for the next scheduled beat.
  const idleNotifiedRef = useRef(false)

  // Admin per-FRO pause: freezes every live counter exactly like meeting mode.
  // Only an admin resume lifts it — the panel never unpauses itself.
  const [paused, setPaused] = useState(false)
  const [pausedBy, setPausedBy] = useState(null)
  const pausedRef = useRef(false)

  // Company-wide meeting mode: freezes every live counter while active.
  const meeting = useMeeting()
  const meetingActive = !!meeting
  const meetingActiveRef = useRef(false); meetingActiveRef.current = meetingActive
  // Wall-clock frozen while the meeting is active (null when not in a meeting).
  const meetingStartRef = useRef(null)
  // Wall-clock frozen while an admin pause is active (null when not paused).
  // Subtracted from the call timer exactly like the meeting window.
  const pauseStartRef = useRef(null)
  // Paused milliseconds accumulated for the CURRENT call (per cycle).
  const callPausedMsRef = useRef(0)

  // Refs mirroring state so syncAllStats stays stable and always reads fresh values
  const activeCallRef = useRef(null); activeCallRef.current = activeCall
  const todayStatsRef = useRef(todayStats); todayStatsRef.current = todayStats
  // True once today's counters have been seeded from the server on panel load.
  // Until then the in-memory counters are ZERO_STATS — pushing them would
  // overwrite the day's real totals (now guarded server-side too, but a fresh
  // tab must never even send zeros).
  const hydratedRef = useRef(false)
  // Timestamp of our last successful heartbeat push. Used after a socket
  // reconnect to detect a server-side reset we missed while disconnected.
  const lastPushAtRef = useRef(0)

  const clearTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }

  /**
   * Take the server's timer answer as truth. Every mutating endpoint (heartbeat,
   * disposition save, Resume) returns the same shape, so they all land here and
   * the chip, popup and idle flag can never disagree with what was stored.
   */
  const adoptTimer = useCallback((s) => {
    if (!s) return
    if (s.disposition_due_at !== undefined) {
      const next = s.disposition_due_at || null
      setDispositionDueAt(next)
      dispositionDueRef.current = next
      // No deadline on the row means the window is not armed at all.
      if (!next) {
        serverSecondsRef.current = null
        setSecondsLeft(null)
      }
    }
    // seconds_left is the server's own remaining time, computed on the server's
    // clock. It is the number of record: the local machine's clock is never
    // involved, so a laptop with the wrong date/time still shows a correct
    // 4:00 after a reset instead of a stuck 0:00.
    if (typeof s.seconds_left === 'number') {
      serverSecondsRef.current = { seconds: s.seconds_left, at: performance.now() }
      setSecondsLeft(s.seconds_left)
    } else if (s.seconds_left === null) {
      // Explicitly "not armed" — never leave a stale countdown on screen.
      serverSecondsRef.current = null
      setSecondsLeft(null)
    }
    if (typeof s.in_shift === 'boolean') {
      setInShift(s.in_shift)
      inShiftRef.current = s.in_shift
    }
    if (typeof s.today_idle_seconds === 'number') setIdleSecondsToday(s.today_idle_seconds)
    if (typeof s.is_idle === 'boolean') {
      setIsIdle(s.is_idle)
      isIdleRef.current = s.is_idle
      if (!s.is_idle) idleNotifiedRef.current = false
    }
  }, [])

  // Stats are server-authoritative: the client keeps today's counters in memory
  // only (never localStorage) and pushes them on every change. statsOverride lets
  // a caller push a freshly-computed value before React re-renders the ref.
  const syncAllStats = useCallback((extra = {}, statsOverride = null) => {
    const stats = statsOverride || todayStatsRef.current
    // Admin pause freezes like meeting mode: panel reports 'meeting' so every
    // timer/counter path treats it as frozen; is_paused on the server row
    // drives the distinct "Paused" display on admin screens.
    const status = (meetingActiveRef.current || pausedRef.current) ? 'meeting'
      : (activeCallRef.current ? 'on_call' : 'online')
    setLiveStatus(status)
    // Pre-hydration (or explicit stats): never send unseeded in-memory
    // counters — status-only announce keeps presence fresh without risking
    // the day's totals. Explicit statsOverride values are always safe to send.
    const countersReady = hydratedRef.current || statsOverride != null
    api('/fro/status', {
      method: 'PUT',
      body: JSON.stringify({
        status,
        current_donor_name: activeCallRef.current?.donorName || null,
        current_donor_id: activeCallRef.current?.donorId || null,
        ...(countersReady ? {
          today_calls: stats.calls,
          today_talk_seconds: stats.totalSeconds,
        } : {}),
        ...extra,
      }),
    })
      .then((res) => {
        lastPushAtRef.current = Date.now()
        adoptTimer(res)
        if (res?.status) setLiveStatus(res.status)
      })
      .catch((err) => { console.error('Error:', err.message); })
  }, [adoptTimer])

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
    hydratedRef.current = true
  }, [])

  // ---------- Meeting mode: freeze every counter ----------
  useEffect(() => {
    if (meetingActive) {
      meetingStartRef.current = Date.now()
      syncAllStats()
    } else {
      // Meeting over — accrue the paused window once, then resume normally.
      if (meetingStartRef.current) {
        const paused = Date.now() - meetingStartRef.current
        callPausedMsRef.current += paused
        meetingStartRef.current = null
      }
      syncAllStats()
    }
  }, [meetingActive, syncAllStats])

  // ---------- Countdown ----------
  // Counts the server's "seconds left" down locally. The only thing read from
  // this machine is elapsed time via performance.now(), never the wall clock, so
  // a laptop whose date/time is wrong cannot pin the display at 0:00 or make a
  // fresh window look unreset. Every heartbeat re-syncs the number, so drift
  // from a throttled tab or a sleeping laptop is corrected within one beat.
  useEffect(() => {
    if (dispositionDueAt == null) {
      setSecondsLeft(null)
      return undefined
    }
    const tick = () => {
      const seed = serverSecondsRef.current
      if (!seed) return
      const left = Math.max(0, Math.round(seed.seconds - (performance.now() - seed.at) / 1000))
      setSecondsLeft(left)
      // Zero while paused or in a meeting is expected — the server holds the
      // deadline back for those, so never flip idle on it.
      //
      // The in_shift guard matters as much as the others. A deadline from an
      // earlier shift is always already past, so left is 0 on arrival; without
      // this the panel declared itself idle off the clock, pushed a heartbeat
      // saying so, and fought the server's own answer on every tick.
      if (left === 0 && !pausedRef.current && !meetingActiveRef.current && !isIdleRef.current && inShiftRef.current) {
        setIsIdle(true)
        isIdleRef.current = true
        // Tell the server now instead of waiting for the next heartbeat, so
        // idle_since is stamped the moment the window actually ran out.
        if (!idleNotifiedRef.current) {
          idleNotifiedRef.current = true
          syncAllStats()
        }
      }
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [dispositionDueAt, syncAllStats])

  // Resume: the FRO acknowledges the idle state. The server commits the elapsed
  // seconds into today and hands back a fresh 4-minute window.
  const resumeIdle = useCallback(async () => {
    try {
      const res = await api('/fro/status/resume-idle', { method: 'POST', body: JSON.stringify({}) })
      adoptTimer(res)
      setLiveStatus(res?.status || 'online')
      setElapsed(0)
      callPausedMsRef.current = 0
      return res
    } catch (err) {
      console.error('Resume failed:', err.message)
      throw err
    }
  }, [adoptTimer])

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
          })
          // Paused while away: enter frozen mode immediately on load.
          if (live.is_paused) {
            pausedRef.current = true
            setPaused(true)
            setPausedBy(live.paused_by || null)
          }
        }
        // The timer is adopted regardless of day match — a lapsed deadline must
        // not be revived just because the counters rolled over.
        adoptTimer(live)
        if (live.status) setLiveStatus(live.status)
      } catch (e) {
        console.error('Error:', e.message)
      } finally {
        // Mark hydrated even on failure / new-day (zeros are then deliberate
        // for the new day) so later syncs carry counters; the pre-hydration
        // sync above stays status-only and can never push unseeded zeros.
        hydratedRef.current = true
        if (!cancelled) syncAllStats()
      }
    })()
    return () => {
      cancelled = true
      if (!localStorage.getItem('ucs_token')) return
      api('/fro/status', { method: 'PUT', body: JSON.stringify({ status: 'offline' }) }).catch(() => {})
    }
  }, [hydrateTodayStats, syncAllStats, adoptTimer])

  // ── Admin per-FRO pause ──────────────────────────────────────
  // applyPause freezes exactly like meeting start: accrue the paused window from
  // this moment, then announce (panel reports 'meeting' while paused; is_paused
  // on the server drives the Paused badge).
  const applyPause = useCallback((by) => {
    if (pausedRef.current) {
      if (by) setPausedBy(by)
      return
    }
    pausedRef.current = true
    setPaused(true)
    setPausedBy(by || null)
    if (pauseStartRef.current == null) pauseStartRef.current = Date.now()
    syncAllStats()
  }, [syncAllStats])

  const clearPause = useCallback(() => {
    if (!pausedRef.current) return
    pausedRef.current = false
    setPaused(false)
    setPausedBy(null)
    // Accrue the paused window once so an in-progress call excludes it,
    // mirroring the meeting-over path.
    if (pauseStartRef.current) {
      const pausedMs = Date.now() - pauseStartRef.current
      callPausedMsRef.current += pausedMs
      pauseStartRef.current = null
    }
    syncAllStats()
  }, [syncAllStats])

  // FRO self-resume: the Play button in the blocking pause popup. Server
  // clears the flag (converging socket event follows); lift locally at once.
  const resumeSelf = useCallback(async () => {
    await api('/fro/status/resume-self', { method: 'POST', body: JSON.stringify({}) })
    clearPause()
  }, [clearPause])

  useEffect(() => {
    if (!localStorage.getItem('ucs_token')) return undefined
    const offPause = onFroPause((evt) => applyPause(evt?.by))
    const offResume = onFroResume(() => clearPause())
    return () => { offPause(); offResume() }
  }, [applyPause, clearPause])

  // Self-row watch (belt and suspenders): every fro_live_status write is
  // broadcast as db:change, so even if a targeted fro:pause/fro:resume event
  // is missed, the panel converges the moment any heartbeat lands. This is
  // what makes pause work for panels that reconnected, missed events, or run
  // older code paths — no room targeting involved.
  // Acting ("work as") session: also watch the real operator's row — a pause
  // on the operator never touches the impersonated target's row, so watching
  // only userId would miss it. Unpause converges via /fro/status/me (which
  // merges both rows) so resuming one side can't lift the other's pause.
  useEffect(() => {
    if (!localStorage.getItem('ucs_token') || !userId) return undefined
    const watched = new Set([String(userId)])
    if (operatorId) watched.add(String(operatorId))
    const converge = () => {
      api('/fro/status/me', { _prefix: 'ucs' })
        .then((live) => {
          if (live?.is_paused) applyPause(live.paused_by)
          else clearPause()
        })
        .catch(() => {})
    }
    return onDbChange({
      table: 'fro_live_status',
      event: '*',
      filter: (p) => watched.has(String((p.new || p.old || {}).worker_id)),
      onInsert: (row) => { if (row?.is_paused) applyPause(row.paused_by); },
      onUpdate: (row) => {
        // Heartbeats rewrite this row ~every 30s without changing pause
        // state — only converge (GET /fro/status/me) when the flag flipped,
        // otherwise every heartbeat costs a pointless round-trip per panel.
        if (!!row?.is_paused === pausedRef.current) return
        if (row?.is_paused) applyPause(row?.paused_by)
        else converge()
      },
      onDelete: () => {},
    })
  }, [userId, operatorId, applyPause, clearPause])

  // Socket reconnect convergence: if the server row was authoritatively
  // zeroed (a midnight reset) while we were disconnected, our in-memory
  // counters are stale — adopting them via max-keep would resurrect the wiped
  // totals on the next push. Adopt the server zeros instead. Non-zero server
  // rows are left alone: max-keep already converges those correctly. Pause
  // state and the disposition timer are always adopted.
  useEffect(() => {
    if (!localStorage.getItem('ucs_token')) return undefined
    return onSocketConnect(() => {
      if (!hydratedRef.current || !lastPushAtRef.current) return
      api('/fro/status/me', { _prefix: 'ucs' })
        .then((live) => {
          if (!live || !live.updated_at) return
          if (live.is_paused && !pausedRef.current) { applyPause(live.paused_by); return }
          if (!live.is_paused && pausedRef.current) { clearPause(); return }
          adoptTimer(live)
          if (new Date(live.updated_at).getTime() <= lastPushAtRef.current) return
          const serverZero = ['today_calls', 'today_talk_seconds']
            .every((k) => Number(live[k] || 0) === 0)
          if (!serverZero) return
          const mem = todayStatsRef.current
          if (!(mem.calls || mem.totalSeconds) > 0) return
          const next = { calls: 0, totalSeconds: 0 }
          todayStatsRef.current = next
          setTodayStats(next)
        })
        .catch(() => {})
    })
  }, [applyPause, clearPause, adoptTimer])
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
      const next = { calls: 0, totalSeconds: 0 }
      todayStatsRef.current = next
      setTodayStats(next)
      setIdleSecondsToday(0)
      setIsIdle(false)
      isIdleRef.current = false
      idleNotifiedRef.current = false
      // force_counters: this zero-push is the deliberate daily reset — it must
      // win over any max-kept value on the server.
      syncAllStats({ force_counters: true }, next)
    }, 30 * 1000)
    return () => clearInterval(timer)
  }, [syncAllStats])

  // Push status whenever it changes (call started/ended)
  useEffect(() => {
    if (!localStorage.getItem('ucs_token')) return
    syncAllStats()
  }, [activeCall, syncAllStats])

  useEffect(() => {
    if (activeCall) {
      timerRef.current = setInterval(() => {
        const nowClock = Date.now()
        const paused = callPausedMsRef.current + (meetingStartRef.current ? nowClock - meetingStartRef.current : 0) + (pauseStartRef.current ? nowClock - pauseStartRef.current : 0)
        setElapsed(Math.max(0, Math.floor((nowClock - activeCall.startTime - paused) / 1000)))
      }, 1000)
      return clearTimer
    } else {
      setElapsed(0)
      callPausedMsRef.current = 0
    }
  }, [activeCall])

  const startDonorView = useCallback((donorId) => {
    lastDonorIdRef.current = donorId
  }, [])

  const endDonorView = useCallback(() => {}, [])

  const startCall = useCallback((donor) => {
    // A new call owns a fresh paused window. endCall clears this too, but the
    // disposition modal can end a call from an unmount cleanup, and the reset
    // effect only runs after commit — clearing here as well means no ordering
    // can leak the previous call's paused time into this call's duration.
    callPausedMsRef.current = 0
    setActiveCall({
      donorId: donor.id || donor.donorId,
      donorName: donor.donor_name || donor.donorName,
      donorMobile: donor.donor_mobile || donor.donorMobile,
      startTime: Date.now(),
    })
  }, [])

  const endCall = useCallback(() => {
    // Read the call through activeCallRef, never through the `activeCall`
    // closure. endCall is invoked from effect cleanups (the disposition modal
    // calls it on unmount with [] deps), where a closure captured before
    // startCall ran still holds activeCall === null — so the old `if (activeCall)`
    // silently skipped the call/talk counters and left today_calls at 0 all day.
    const call = activeCallRef.current
    if (call) {
      // Clear before counting so a cleanup plus an explicit endCall in the same
      // tick cannot book the same call twice.
      activeCallRef.current = null
      const nowClock = Date.now()
      // Meeting/paused time is excluded: only talk time outside those windows counts.
      const paused = callPausedMsRef.current + (meetingStartRef.current ? nowClock - meetingStartRef.current : 0) + (pauseStartRef.current ? nowClock - pauseStartRef.current : 0)
      const duration = Math.max(0, Math.floor((nowClock - call.startTime - paused) / 1000))
      // Clear the accumulator synchronously, right here in the event handler.
      // It used to be cleared only by the `else` branch of the [activeCall]
      // effect, which runs AFTER this render commits — and startCall never
      // cleared it either. So the next call subtracted every previous call's
      // paused time from its own elapsed, `duration` went to 0, and the
      // `if (duration > 0)` guard below silently dropped the increment. That is
      // why today_calls/today_talk_seconds were 0 in all 594 fro_daily_stats
      // rows while skipped and idle were recorded normally.
      callPausedMsRef.current = 0
      if (duration > 0) {
        commitTodayStats({
          calls: todayStatsRef.current.calls + 1,
          totalSeconds: todayStatsRef.current.totalSeconds + duration,
        })
      }
    }
    setActiveCall(null)
  }, [commitTodayStats])

  return (
    <CallContext.Provider value={{
      activeCall, elapsed, todayStats, startCall, endCall, isOnCall: !!activeCall,
      startDonorView, endDonorView, syncAllStats, fmt,
      status: liveStatus,
      paused, pausedBy, resumeSelf,
      // Disposition timer / idle
      dispositionDueAt, secondsLeft, isIdle, idleSecondsToday, inShift,
      resumeIdle, adoptTimer, DISPOSITION_WINDOW,
    }}>
      {children}
    </CallContext.Provider>
  )
}

export function useCall() {
  const ctx = useContext(CallContext)
  if (!ctx) throw new Error('useCall must be used within CallProvider')
  return ctx
}
