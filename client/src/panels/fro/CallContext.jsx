import { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo } from 'react'
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
  console.log(m,"Minutes")
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
  // every recorded activity. When it runs out they are idle until they record
  // any activity. All of that is decided on the server; these values are its
  // answers, mirrored so the chip and banner can render.
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
  // The server's committed idle total plus the monotonic reading taken when it
  // arrived, so the "idle counter" in the clock widget can tick up live between
  // heartbeats instead of sitting frozen for 30s at a time.
  const idleSeedRef = useRef({ seconds: 0, at: 0 })
  const [idleLiveSeconds, setIdleLiveSeconds] = useState(0)

  // Reaching zero asks the server whether it agrees they are idle, and the panel
  // records the transition (idle_since) as soon as it says so.
  const idleNotifiedRef = useRef(false)
  // Reaching zero asks the server "am I idle?". If it says not yet, that is
  // usually just a clock/network lag, so ask a few more times over the next few
  // seconds and then stop. Bounded on purpose: there is no periodic heartbeat in
  // this panel, so this is the only thing that can resolve a disagreement, and it
  // must not become a background poll.
  const IDLE_CONFIRM_MAX = 4
  const IDLE_CONFIRM_MS = 2500
  const idleAskRef = useRef({ count: 0, at: 0 })
  // Throttle for mirroring the running idle figure to localStorage.
  const idlePersistAtRef = useRef(0)

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

  // ── Survive a reload ──────────────────────────────────────────
  // The countdown and the idle figure must not reset when the FRO hits F5. The
  // server remains the authority — this is only the bridge across the gap while
  // the panel is remounting, so a reload shows the number the FRO was already
  // looking at instead of a jarring snap back to 4:00.
  //
  // Deliberately NOT used for the day totals in todayStats: those are counters
  // that only ever grow on the server, and mirroring them locally was what
  // previously resurrected a midnight-zeroed row.
  const timerStoreKey = useMemo(
    () => (userId ? `ucs_fro_timer_v1_${userId}` : null),
    [userId]
  )

  const persistTimer = useCallback((s) => {
    if (!timerStoreKey) return
    try {
      localStorage.setItem(timerStoreKey, JSON.stringify({
        disposition_due_at: s.dispositionDueAt ?? null,
        seconds_left: s.secondsLeft ?? null,
        is_idle: !!s.isIdle,
        idle_total: s.idleTotal ?? null,
        idle_live: s.idleLive ?? null,
        // Wall clock, used only to discount the reload gap on the way back in.
        saved_at: Date.now(),
      }))
    } catch (_) { /* private mode / quota — the server still has the truth */ }
  }, [timerStoreKey])

  const readPersistedTimer = useCallback(() => {
    if (!timerStoreKey) return null
    try {
      const raw = localStorage.getItem(timerStoreKey)
      if (!raw) return null
      const saved = JSON.parse(raw)
      if (!saved || typeof saved !== 'object') return null
      // Yesterday's numbers must never come back to life today.
      if (istDateString(saved.saved_at) !== istDateString()) return null
      return saved
    } catch (_) { return null }
  }, [timerStoreKey])

  const clearPersistedTimer = useCallback(() => {
    if (!timerStoreKey) return
    try { localStorage.removeItem(timerStoreKey) } catch (_) { /* ignore */ }
  }, [timerStoreKey])

  /**
   * Take the server's timer answer as truth. Every mutating endpoint (status
   * push, disposition save, Resume) returns the same shape, so they all land
   * here and the chip, popup and idle flag can never disagree with what was
   * stored.
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
      // A fresh, still-open window means there is genuinely time left, so the
      // "ask the server whether I am idle" latch is released. It deliberately
      // does NOT release on a plain is_idle:false, otherwise sitting on 0:00
      // while the server still disagreed would re-ask every second. The bounded
      // retry below is what covers that case instead.
      if (s.seconds_left > 0) {
        idleNotifiedRef.current = false
        // A genuinely open window re-arms the ask budget for the next expiry.
        idleAskRef.current = { count: 0, at: 0 }
      }
    } else if (s.seconds_left === null) {
      // Explicitly "not armed" — never leave a stale countdown on screen.
      serverSecondsRef.current = null
      setSecondsLeft(null)
    }
    if (typeof s.in_shift === 'boolean') {
      setInShift(s.in_shift)
      inShiftRef.current = s.in_shift
    }
    if (typeof s.today_idle_seconds === 'number') {
      setIdleSecondsToday(s.today_idle_seconds)
      idleSeedRef.current = { seconds: s.today_idle_seconds, at: performance.now() }
    }
    if (typeof s.is_idle === 'boolean') {
      setIsIdle(s.is_idle)
      isIdleRef.current = s.is_idle
    }
    // Mirror the authoritative answer so a reload has something to show.
    persistTimer({
      dispositionDueAt: s.disposition_due_at !== undefined ? (s.disposition_due_at || null) : dispositionDueRef.current,
      secondsLeft: typeof s.seconds_left === 'number'
        ? s.seconds_left
        : (s.seconds_left === null ? null : serverSecondsRef.current?.seconds ?? null),
      isIdle: typeof s.is_idle === 'boolean' ? s.is_idle : isIdleRef.current,
      idleTotal: typeof s.today_idle_seconds === 'number' ? s.today_idle_seconds : idleSeedRef.current.seconds,
      idleLive: isIdleRef.current ? (idleSeedRef.current.seconds + (performance.now() - idleSeedRef.current.at) / 1000) : null,
    })
  }, [persistTimer])

  /**
   * Restart the 4-minute window the moment the FRO records a disposition,
   * without waiting for the network round trip.
   *
   * Every disposition save used to adopt the server's timer only after its await
   * resolved, which tied the countdown to connectivity: on a dead or slow
   * connection the chip kept counting the old deadline, the save button stayed
   * disabled on "Loading...", and the FRO watched the clock run down for an
   * action they had already taken. This restarts the window locally at submit
   * time; the server's own timer overwrites it the moment the response lands, and
   * the next hydrate reconciles it if the response never comes.
   *
   * seconds_left is what the chip counts down from, anchored to performance.now()
   * rather than the wall clock, so a machine with a wrong date still shows a
   * correct 4:00 — the same property the server-sourced path relies on.
   */
  const adoptOptimisticDisposition = useCallback(() => {
    adoptTimer({
      disposition_due_at: new Date(Date.now() + DISPOSITION_WINDOW * 1000).toISOString(),
      seconds_left: DISPOSITION_WINDOW,
      is_idle: false,
    });
  }, [adoptTimer])

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
  // fresh window look unreset. The seed is re-taken whenever the panel talks to
  // the server (open, call start/stop, pause, disposition, resume), so drift
  // from a throttled tab or a sleeping laptop is corrected on the next sync.
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
        // The server decides idle, never this countdown. It used to set isIdle
        // here, which flashed the idle banner for a frame: the two clocks are
        // never perfectly aligned, so whenever the server still believed the
        // window was open it answered is_idle false, the banner vanished, and
        // the re-seeded seconds_left put the display back up around 3:40. Now the
        // only thing that happens at zero is a push to ask the server, and the
        // banner appears and stays exactly when the server says idle. If the
        // server disagrees, its own seconds_left re-seeds the display instead.
        //
        // With no periodic heartbeat, a single ask could go unanswered by a
        // transient failure and the banner would never appear at all. So ask
        // again a few times, rate-limited, then give up rather than poll.
        const ask = idleAskRef.current
        const nowMs = performance.now()
        if (!idleNotifiedRef.current) {
          idleNotifiedRef.current = true
          ask.count = 1
          ask.at = nowMs
          syncAllStats()
        } else if (ask.count < IDLE_CONFIRM_MAX && nowMs - ask.at >= IDLE_CONFIRM_MS) {
          ask.count += 1
          ask.at = nowMs
          syncAllStats()
        }
      }
      // While idle, keep the on-screen idle counter counting up between beats.
      if (isIdleRef.current) {
        const live = idleSeedRef.current.seconds + (performance.now() - idleSeedRef.current.at) / 1000
        setIdleLiveSeconds(live)
        // Mirror it as it runs so a reload resumes the same figure instead of
        // restarting the count. Throttled — this is a small JSON write and there
        // is no need to do it 60 times a minute.
        const nowMs = performance.now()
        if (nowMs - idlePersistAtRef.current >= 5000) {
          idlePersistAtRef.current = nowMs
          persistTimer({
            dispositionDueAt: dispositionDueRef.current,
            secondsLeft: serverSecondsRef.current?.seconds ?? null,
            isIdle: true,
            idleTotal: idleSeedRef.current.seconds,
            idleLive: live,
          })
        }
      }
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [dispositionDueAt, syncAllStats, persistTimer])

  // There is no resumeIdle. Idle is cleared only by recording a disposition,
  // which is the one action that produces something real; the endpoint that used
  // to hand back a free 4-minute window was removed rather than left callable.
  // See IdleGate in FROPanel.jsx for why that matters.

  // ---------- Stats sync & status transitions ----------
  useEffect(() => {
    if (!localStorage.getItem('ucs_token')) return
    let cancelled = false

    // Paint the last known timer before the network answers, so a reload shows
    // the number the FRO was already looking at instead of snapping back to
    // 4:00 (or blank) for a beat. Discount the time the tab was closed using the
    // wall clock, but only ever downwards: a laptop with a wrong date can make
    // this gap too big, never too generous, and the server's own answer lands
    // moments later and is what counts.
    const saved = readPersistedTimer()
    if (saved) {
      const gap = Math.max(0, Math.round((Date.now() - (saved.saved_at || Date.now())) / 1000))
      const restored = typeof saved.seconds_left === 'number'
        ? Math.max(0, saved.seconds_left - gap)
        : null
      if (saved.disposition_due_at) {
        setDispositionDueAt(saved.disposition_due_at)
        dispositionDueRef.current = saved.disposition_due_at
      }
      if (typeof saved.idle_total === 'number') {
        setIdleSecondsToday(saved.idle_total)
        idleSeedRef.current = { seconds: saved.idle_total, at: performance.now() }
      }
      if (saved.is_idle) {
        setIsIdle(true)
        isIdleRef.current = true
        if (typeof saved.idle_live === 'number') {
          setIdleLiveSeconds(saved.idle_live + gap)
        }
      }
      if (restored !== null) {
        serverSecondsRef.current = { seconds: restored, at: performance.now() }
        setSecondsLeft(restored)
      }
    }

    // No localStorage for the counters: hydrate today's stats from the server
    // (same IST day only — a new day starts at zero), then announce online.
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
  }, [hydrateTodayStats, syncAllStats, adoptTimer, readPersistedTimer])

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
        // Ordinary status pushes rewrite this row without changing pause state,
        // so only converge (GET /fro/status/me) when the flag actually flipped,
        // otherwise every push costs a pointless round-trip per panel.
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
      dispositionDueAt, secondsLeft, isIdle, idleSecondsToday, idleLiveSeconds, inShift,
      adoptTimer, adoptOptimisticDisposition, DISPOSITION_WINDOW,
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
