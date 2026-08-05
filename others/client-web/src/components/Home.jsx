import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../store'
import { api } from '../api'
import { subscribeWorker } from '../socket'
import HomeModals from './HomeModals'

export default function Home() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [time, setTime] = useState(new Date())
  const [today, setToday] = useState(() => {
    const c = api.getCachedToday()
    return c ? (c.attendance || c) : null
  })
  const [history, setHistory] = useState(() => api.getCachedHistory())
  const [punched, setPunched] = useState(() => {
    const c = api.getCachedToday()
    const att = c ? (c.attendance || c) : null
    return !!(att?.punch_in_time && !att?.punch_out_time)
  })
  const [loading, setLoading] = useState(true)
  const [punching, setPunching] = useState(false)
  const [lateUsed, setLateUsed] = useState(() => api.getCachedToday()?.lateUsed ?? 0)
  const [pendingLoans, setPendingLoans] = useState(() => api.getCachedLoans().filter(l => l.status === 'approved' || l.status === 'pending'))
  const [unread, setUnread] = useState(() => api.getCachedUnreadCount())
  const [showNotifs, setShowNotifs] = useState(false)
  const [notifications, setNotifications] = useState(() => api.getCachedNotifications())
  const [showLeave, setShowLeave] = useState(false)
  const [showAdvance, setShowAdvance] = useState(false)
  const [shiftStart, setShiftStart] = useState(() => api.getCachedToday()?.officeStartTime || '10:00')
  const [shiftEnd, setShiftEnd] = useState(() => api.getCachedToday()?.officeEndTime || '19:00')
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const pollRef = useRef(null)
  const notifPollRef = useRef(null)

  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t) }, [])

  const loadData = useCallback(async () => {
    try {
      const [td, h] = await Promise.all([api.today(), api.history()])
      const att = td?.attendance || td || {}
      setToday(att)
      setHistory(Array.isArray(h) ? h : h?.history || [])
      setPunched(!!(att?.punch_in_time))
      if (att?.punch_out_time) setPunched(false)
      if (td?.lateUsed !== undefined) setLateUsed(td.lateUsed)
      if (td?.officeStartTime) setShiftStart(td.officeStartTime)
      if (td?.officeEndTime) setShiftEnd(td.officeEndTime)
    } catch (_) {} finally { setLoading(false) }

    try {
      const d = await api.myLoans()
      const list = Array.isArray(d) ? d : d?.loans || []
      setPendingLoans(list.filter(l => l.status === 'approved' || l.status === 'pending'))
    } catch (_) {}
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    api.myProfile().then(d => {
      const w = d?.worker || d
      if (w?.shift_start_time) setShiftStart(w.shift_start_time)
      if (w?.shift_end_time) setShiftEnd(w.shift_end_time)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!user?.id) return
    api.unreadCount(user.id).then(d => setUnread(d?.count || 0)).catch(() => {})
    const refreshToday = () => {
      api.today().then(td => {
        const att = td?.attendance || td || {}
        setToday(att)
        setPunched(!!(att?.punch_in_time))
        if (att?.punch_out_time) setPunched(false)
        if (td?.lateUsed !== undefined) setLateUsed(td.lateUsed)
      }).catch(() => {})
    }
    const off = subscribeWorker(user.id, (event) => {
      if (event === 'attendance') {
        refreshToday()
      } else if (event === 'notifications') {
        api.unreadCount(user.id).then(d => setUnread(d?.count || 0)).catch(() => {})
      } else if (event === 'loans') {
        api.myLoans().then(d => {
          const list = Array.isArray(d) ? d : d?.loans || []
          setPendingLoans(list.filter(l => l.status === 'approved' || l.status === 'pending'))
        }).catch(() => {})
      }
    })
    notifPollRef.current = setInterval(() => {
      api.unreadCount(user.id).then(d => setUnread(d?.count || 0)).catch(() => {})
    }, 30000)
    pollRef.current = setInterval(refreshToday, 15000)
    return () => {
      if (notifPollRef.current) clearInterval(notifPollRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
      off()
    }
  }, [user?.id])

  useEffect(() => {
    const onVisible = () => { if (!document.hidden) loadData() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadData])

  useEffect(() => {
    if (location.state?.refresh) {
      loadData()
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state?.refresh])

  const clearMessages = () => { setError(''); setSuccessMsg('') }

  const openNotifs = async () => {
    setShowNotifs(!showNotifs)
    if (!showNotifs && user?.id) {
      const n = await api.notifications(user.id).catch(() => [])
      setNotifications(Array.isArray(n) ? n : [])
    }
  }

  const markRead = async (id) => {
    await api.markRead(id).catch(() => {})
    setNotifications(ns => {
      const next = ns.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
      setUnread(next.filter(n => !n.read_at).length)
      return next
    })
  }

  const deleteNotif = async (id) => {
    await api.deleteNotification(id).catch(() => {})
    setNotifications(ns => {
      const next = ns.filter(n => n.id !== id)
      setUnread(next.filter(n => !n.read_at).length)
      return next
    })
  }

  const handlePunchIn = () => navigate('/scanner', { state: { mode: 'in', returnTo: '/home' } })

  const handlePunchOut = () => navigate('/scanner', { state: { mode: 'out', returnTo: '/home' } })

  const handlePunch = () => {
    clearMessages()
    if (today?.punch_out_time) {
      setError('Already punched out today.')
      return
    }
    if (today?.punch_in_time) {
      handlePunchOut()
    } else {
      handlePunchIn()
    }
  }

  const formatTime = (iso) => {
    if (!iso) return '--:--'
    const d = new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000)
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  }

  const calcWorked = () => {
    const inTime = today?.punch_in_time
    if (!inTime) return null
    const diff = (Date.now() - new Date(inTime).getTime()) / 3600000
    const h = Math.floor(diff); const m = Math.floor((diff - h) * 60)
    return `${h}h ${m}m`
  }

  const allHistory = Array.isArray(history) ? history : []
  const presentLate = allHistory.filter(r => r.status === 'present' || r.status === 'late').length
  const totalDays = allHistory.length || 1
  const attendancePct = Math.round((presentLate / totalDays) * 100) || 0
  const totalLate = allHistory.reduce((s, r) => s + (r.late_minutes || 0), 0)
  const lateMinutes = lateUsed ?? totalLate

  const lateTier = lateMinutes <= 180 ? 0 : lateMinutes <= 240 ? 1 : lateMinutes <= 480 ? 2 : 3
  const lateTierLabel = ['Within grace limit', 'Half-day deduction', 'One-day deduction', 'Proportional deduction'][lateTier]
  const lateTierColor = ['#2a6a4b', '#e67e22', '#d35400', '#ba1a1a'][lateTier]
  const batch1Pct = Math.min(lateMinutes / 180, 1)
  const batch2Pct = lateMinutes > 180 ? Math.min((lateMinutes - 180) / 60, 1) : 0

  const hours = String(time.getHours() % 12 || 12).padStart(2, '0')
  const mins = String(time.getMinutes()).padStart(2, '0')
  const ampm = time.getHours() >= 12 ? 'PM' : 'AM'

  const isPunchingOut = !!(today?.punch_in_time && !today?.punch_out_time)

  return (
    <>
      <div className="app-container space-y-4 animate-fade-in safe-top">
        {/* Error / Success Toast */}
        {error && (
          <div className="bg-[var(--red-bg)] text-[var(--red)] text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 animate-fade-in">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} className="opacity-60 hover:opacity-100">&times;</button>
          </div>
        )}
        {successMsg && (
          <div className="bg-[var(--green-bg)] text-[var(--green)] text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 animate-fade-in">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <span className="flex-1">{successMsg}</span>
            <button onClick={() => setSuccessMsg('')} className="opacity-60 hover:opacity-100">&times;</button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-[var(--ink-muted)]">Hello there</div>
            <div className="text-lg font-bold text-[var(--primary)] truncate">{user?.name?.split(' ')[0] || 'Employee'}</div>
          </div>
          <button onClick={openNotifs} className="relative p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
            <BellSvg className="w-5 h-5 text-[var(--ink-soft)]" />
            {unread > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[var(--red)] text-white text-[9px] flex items-center justify-center font-bold">{unread > 9 ? '9+' : unread}</span>}
          </button>
        </div>

        {/* Notifications Sheet */}
        {showNotifs && (
          <div className="fixed inset-0 z-50" onClick={() => setShowNotifs(false)}>
            <div className="absolute inset-0 bg-black/20" />
            <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[60vh] md:max-h-[80vh] md:top-1/2 md:left-1/2 md:bottom-auto md:right-auto md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-md md:rounded-2xl overflow-y-auto animate-slide-up md:animate-fade-in shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b border-[var(--border)] px-4 py-3 flex items-center justify-between rounded-t-2xl md:rounded-t-2xl z-10">
                <h3 className="font-semibold text-sm">Notifications</h3>
                <div className="flex items-center gap-2">
                  {unread > 0 && <span className="text-[10px] font-semibold text-[var(--ink-soft)]">{unread} unread</span>}
                  <button onClick={() => setShowNotifs(false)} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--ink-soft)] text-lg">&times;</button>
                </div>
              </div>
              <div className="p-4 space-y-2">
                {notifications.length === 0 ? (
                  <div className="text-center py-8 text-sm text-[var(--ink-muted)]">No notifications</div>
                ) : notifications.map((n, i) => (
                  <div key={n.id || i} className={`p-3 rounded-lg text-sm ${n.read_at ? 'opacity-60' : 'bg-[var(--surface)] border border-[var(--border)]'}`}>
                    <div className="flex items-start gap-2">
                      <NotifIcon type={n.type} className="w-4 h-4 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{n.title || n.message}</div>
                        {(n.body || n.message) && n.title && <div className="text-[var(--ink-soft)] text-xs mt-0.5">{n.body || n.message}</div>}
                        {!n.title && n.message && <div className="text-[var(--ink-soft)] text-xs mt-0.5">{n.message}</div>}
                      </div>
                    </div>
                    <div className="flex gap-3 mt-2">
                      {!n.read_at && (
                        <button onClick={() => markRead(n.id)} className="text-[11px] font-medium text-blue-600 hover:underline">
                          <CheckSvg className="w-3.5 h-3.5 inline mr-1" />Mark read
                        </button>
                      )}
                      <button onClick={() => deleteNotif(n.id)} className="text-[11px] font-medium text-[var(--red)] hover:underline">
                        <TrashSvg className="w-3.5 h-3.5 inline mr-1" />Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Shift Badge */}
        <div className="inline-block px-3 py-1 rounded-full bg-[var(--primary)]/5 text-[10px] font-semibold text-[var(--primary)] tracking-wider">
          SHIFT {shiftStart} - {shiftEnd}
        </div>

        {/* Clock + Punch */}
        <div className="bg-white rounded-2xl px-4 py-5 sm:p-6 shadow-sm border border-[var(--border)] text-center">
          <div className="text-4xl sm:text-5xl md:text-6xl font-bold text-[var(--primary)] tracking-tight font-mono">
            {hours}:{mins} <span className="text-base sm:text-lg md:text-xl font-normal text-[var(--ink-muted)]">{ampm}</span>
          </div>
          {isPunchingOut && <div className="mt-1 inline-block px-3 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">{calcWorked()} worked</div>}
          {today?.punch_out_time && <div className="mt-1 inline-block px-3 py-0.5 rounded-full bg-green-50 text-green-700 text-xs font-medium">Done for the day</div>}

          <div className="mt-5 sm:mt-6 flex justify-center">
            <button onClick={handlePunch} disabled={punching}
              className={`w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 lg:w-56 lg:h-56 rounded-full flex items-center justify-center text-white font-bold text-base sm:text-lg md:text-xl transition-all duration-300 aspect-square shrink-0 active:scale-95 disabled:opacity-70 ${
                today?.punch_out_time
                  ? 'bg-gradient-to-br from-gray-400 to-gray-500 cursor-default'
                  : isPunchingOut
                    ? 'bg-gradient-to-br from-blue-600 to-blue-800 animate-pulse-ring'
                    : 'bg-gradient-to-br from-slate-800 to-slate-900 animate-pulse-ring'
              }`}
              style={{ borderRadius: '50%' }}>
              {punching ? (
                <div className="flex flex-col items-center gap-1">
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs">Working...</span>
                </div>
              ) : (
                <div className="text-center text-base sm:text-xl md:text-2xl leading-tight">
                  {today?.punch_out_time
                    ? <>Done</>
                    : isPunchingOut
                      ? <>Punch<br />Out</>
                      : <>Punch<br />In</>
                  }
                </div>
              )}
            </button>
          </div>

          <div className="mt-5 sm:mt-6 grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
              <div className="text-[10px] text-[var(--ink-muted)] uppercase tracking-wider">In</div>
              <div className="text-base sm:text-lg font-semibold mt-0.5">{formatTime(today?.punch_in_time)}</div>
            </div>
            <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
              <div className="text-[10px] text-[var(--ink-muted)] uppercase tracking-wider">Out</div>
              <div className="text-base sm:text-lg font-semibold mt-0.5">{formatTime(today?.punch_out_time)}</div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
          <button onClick={() => navigate('/attendance')} className="bg-white rounded-xl p-4 shadow-sm border border-[var(--border)] text-left hover:border-blue-200 transition-colors min-h-[88px] h-full flex flex-col">
            <div className="text-[10px] text-[var(--ink-muted)] uppercase tracking-wider">Attendance</div>
            <div className="text-xl sm:text-2xl font-bold text-[var(--sage)] mt-1">{attendancePct}%</div>
            <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full bg-[var(--sage)] transition-all duration-500" style={{ width: `${attendancePct}%` }} />
            </div>
          </button>
          <button onClick={() => navigate('/attendance')} className="bg-white rounded-xl p-4 shadow-sm border border-[var(--border)] text-left hover:border-blue-200 transition-colors min-h-[88px] h-full flex flex-col">
            <div className="text-[10px] text-[var(--ink-muted)] uppercase tracking-wider">Late Batch</div>
            <div className="flex items-center gap-2 mt-1">
              <div className="text-xl sm:text-2xl font-bold" style={{ color: lateTierColor }}>
                {Math.floor(lateMinutes / 60)}h {String(lateMinutes % 60).padStart(2, '0')}m
              </div>
            </div>
            <span className="mt-1 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ color: lateTierColor, backgroundColor: `${lateTierColor}1f` }}>{lateTierLabel}</span>
            <div className="mt-2 flex h-1.5 rounded-full overflow-hidden bg-gray-100">
              <div className="h-full" style={{ width: '60%', backgroundColor: batch1Pct > 0 ? '#2a6a4b' : 'transparent' }}>
                <div className="h-full" style={{ width: `${batch1Pct * 100}%`, backgroundColor: '#2a6a4b' }} />
              </div>
              <div className="h-full" style={{ width: '40%', backgroundColor: batch2Pct > 0 ? '#e67e22' : 'transparent' }}>
                <div className="h-full" style={{ width: `${batch2Pct * 100}%`, backgroundColor: '#e67e22' }} />
              </div>
            </div>
            <div className="flex justify-between mt-0.5 text-[9px] text-[var(--ink-soft)]">
              <span>0–180m</span>
              <span>181–240m</span>
            </div>
          </button>
        </div>

        {/* Pending Loans */}
        {pendingLoans.length > 0 && (
          <button onClick={() => navigate('/profile')} className="w-full bg-white rounded-xl px-4 py-3.5 shadow-sm border border-[var(--border)] flex items-center gap-3 text-left hover:bg-[var(--surface)] transition-colors">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center shrink-0">
              <WalletSvg className="w-5 h-5 text-yellow-700" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">Pending Loans</div>
              <div className="text-xs text-[var(--ink-soft)]">
                {pendingLoans.length} active · ₹{pendingLoans.reduce((s, l) => s + (parseInt(l.remaining_amount ?? l.total_amount ?? 0) || 0), 0).toLocaleString('en-IN')}
              </div>
            </div>
            <ChevronSvg className="w-4 h-4 text-[var(--ink-muted)]" />
          </button>
        )}

        {/* Action Links */}
        <div className="bg-white rounded-xl shadow-sm border border-[var(--border)] divide-y divide-[var(--border)]">
          <button onClick={() => setShowLeave(true)} className="flex items-center gap-3 px-4 py-3.5 w-full text-left hover:bg-[var(--surface)] transition-colors min-h-[52px]">
            <PlaneSvg className="w-5 h-5 text-[var(--primary-light)] shrink-0" />
            <span className="text-sm flex-1">Take a break or leave</span>
            <ChevronSvg className="w-4 h-4 text-[var(--ink-muted)]" />
          </button>
          <button onClick={() => setShowAdvance(true)} className="flex items-center gap-3 px-4 py-3.5 w-full text-left hover:bg-[var(--surface)] transition-colors min-h-[52px]">
            <DollarSvg className="w-5 h-5 text-[var(--primary-light)] shrink-0" />
            <span className="text-sm flex-1">Apply for Advance / Loan</span>
            <ChevronSvg className="w-4 h-4 text-[var(--ink-muted)]" />
          </button>
        </div>
      </div>

      <HomeModals showLeave={showLeave} setShowLeave={setShowLeave} showAdvance={showAdvance} setShowAdvance={setShowAdvance} />
    </>
  )
}

function BellSvg({ className }) { return <svg width={20} height={20} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg> }
function PlaneSvg({ className }) { return <svg width={20} height={20} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg> }
function DollarSvg({ className }) { return <svg width={20} height={20} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> }
function WalletSvg({ className }) { return <svg width={20} height={20} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 7V5a2 2 0 00-2-2H4a2 2 0 00-2 2v14a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-2"/><rect x="14" y="11" width="8" height="4" rx="1"/><line x1="18" y1="11" x2="18.01" y2="11"/></svg> }
function ChevronSvg({ className }) { return <svg width={14} height={14} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg> }
function CheckSvg({ className }) { return <svg width={14} height={14} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> }
function TrashSvg({ className }) { return <svg width={14} height={14} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg> }
function NotifIcon({ type, className }) {
  const path = (() => {
    switch (type) {
      case 'birthday': return <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>
      case 'event': return <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>
      case 'notice': return <><path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 11-5.8-1.6"/></>
      case 'achievement': return <><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v7a5 5 0 01-10 0V4z"/><path d="M7 6H4a2 2 0 002 4h1"/><path d="M17 6h3a2 2 0 01-2 4h-1"/></>
      default: return <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></>
    }
  })()
  return <svg width={16} height={16} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{path}</svg>
}
