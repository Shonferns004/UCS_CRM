import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { api } from './api/auth'

const CallContext = createContext()

const STATS_KEY = 'fro_call_stats'

function loadStats(userId) {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    if (!raw) return { calls: 0, totalSeconds: 0 }
    const data = JSON.parse(raw)
    const today = new Date().toISOString().slice(0, 10)
    if (data.date === today && data.userId === userId) {
      return { calls: data.calls || 0, totalSeconds: data.totalSeconds || 0 }
    }
    return { calls: 0, totalSeconds: 0 }
  } catch { return { calls: 0, totalSeconds: 0 } }
}

function saveStats(userId, stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      userId,
      calls: stats.calls,
      totalSeconds: stats.totalSeconds,
    }))
  } catch {}
}

export function CallProvider({ children, userId }) {
  const [activeCall, setActiveCall] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef(null)
  const [todayStats, setTodayStats] = useState(() => loadStats(userId))

  useEffect(() => {
    if (activeCall) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - activeCall.startTime) / 1000))
      }, 1000)
      return () => clearInterval(timerRef.current)
    } else {
      setElapsed(0)
    }
  }, [activeCall])

  useEffect(() => {
    api('/fro/status', { method: 'PUT', body: JSON.stringify({ status: 'online', today_calls: todayStats.calls, today_talk_seconds: todayStats.totalSeconds }) }).catch(() => {})
    return () => {
      api('/fro/status', { method: 'PUT', body: JSON.stringify({ status: 'offline' }) }).catch(() => {})
    }
  }, [])

  const startCall = useCallback((donor) => {
    setActiveCall({
      donorId: donor.id || donor.donorId,
      donorName: donor.donor_name || donor.donorName,
      donorMobile: donor.donor_mobile || donor.donorMobile,
      startTime: Date.now(),
    })
    api('/fro/status', {
      method: 'PUT',
      body: JSON.stringify({
        status: 'on_call',
        current_donor_name: donor.donor_name || donor.donorName,
        current_donor_id: donor.id || donor.donorId,
        today_calls: todayStats.calls,
        today_talk_seconds: todayStats.totalSeconds,
      }),
    }).catch(() => {})
  }, [todayStats])

  const endCall = useCallback(() => {
    if (activeCall) {
      const duration = Math.floor((Date.now() - activeCall.startTime) / 1000)
      setTodayStats(prev => {
        const next = { calls: prev.calls + 1, totalSeconds: prev.totalSeconds + duration }
        saveStats(userId, next)
        return next
      })
    }
    setActiveCall(null)
    api('/fro/status', {
      method: 'PUT',
      body: JSON.stringify({
        status: 'idle',
        current_donor_name: null,
        current_donor_id: null,
        today_calls: todayStats.calls + 1,
        today_talk_seconds: todayStats.totalSeconds + (activeCall ? Math.floor((Date.now() - activeCall.startTime) / 1000) : 0),
      }),
    }).catch(() => {})
  }, [activeCall, userId, todayStats])

  return (
    <CallContext.Provider value={{ activeCall, elapsed, todayStats, startCall, endCall, isOnCall: !!activeCall }}>
      {children}
    </CallContext.Provider>
  )
}

export function useCall() {
  const ctx = useContext(CallContext)
  if (!ctx) throw new Error('useCall must be used within CallProvider')
  return ctx
}
