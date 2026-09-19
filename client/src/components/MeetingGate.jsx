import { useEffect, useState } from 'react'
import { useMeeting, endMeeting } from '../meetingStore'

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'superadmin', 'master', 'administrator'])
const GATE_ROLES = new Set(['fro', 'worker', 'team_lead'])

function getRole() {
  try {
    const u = localStorage.getItem('ucs_user')
    return u ? String(JSON.parse(u).role || '') : ''
  } catch { return '' }
}

const fmtElapsed = (secs) => {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}

function ElapsedTicker({ since }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const start = new Date(since).getTime()
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtElapsed(Number.isNaN(start) ? 0 : Math.max(0, Math.floor((now - start) / 1000)))}</span>
}

// Team-scoped "Meeting" gate. Mounted once in App.jsx; it only renders for FRO
// panel roles (backend already scopes GET /meeting to the caller's team), so
// admin/HR/Accounts panels never block. There is deliberately no close button —
// it disappears only when an admin ends the meeting.
export default function MeetingGate() {
  const meeting = useMeeting()
  const [stopping, setStopping] = useState(false)

  const role = getRole().trim().toLowerCase()

  // Only FRO workforce roles surface the gate.
  if (!GATE_ROLES.has(role)) return null
  if (!meeting || !meeting.active) return null

  const canStop = ADMIN_ROLES.has(role)

  const stop = async () => {
    if (stopping) return
    setStopping(true)
    try {
      await endMeeting()
    } catch (e) { console.error('Error:', e.message); }
    finally { setStopping(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(15,23,42,.88)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <style>{'@keyframes meet-pop { 0% { transform: scale(.5); opacity: 0; } 60% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }'}</style>
      <div style={{ width: 'min(460px, 100%)', maxHeight: '94vh', overflowY: 'auto', borderRadius: 20, background: '#fff', boxShadow: '0 30px 80px rgba(0,0,0,.5)', overflow: 'hidden', animation: 'meet-pop .4s cubic-bezier(.22,1,.36,1)' }}>
        <div style={{ height: 6, background: 'linear-gradient(90deg,#7c3aed,#db2777,#f59e0b)' }} />
        <div style={{ padding: '28px 26px 26px', textAlign: 'center' }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', margin: '0 auto', background: 'linear-gradient(135deg,#7c3aed,#4338ca)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 14px 34px rgba(124,58,237,.45)' }}>
            <span style={{ fontSize: 42 }}>📢</span>
          </div>
          <div style={{ marginTop: 18, fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#7c3aed', background: '#f5f3ff', padding: '5px 12px', borderRadius: 999, display: 'inline-block' }}>
            {(meeting.teams && meeting.teams.length > 0) ? `Teams: ${meeting.teams.join(' · ')}` : 'All Teams'}
          </div>
          <h2 style={{ margin: '12px 0 4px', fontSize: 26, fontWeight: 900, color: '#0f172a' }}>Meeting in Progress</h2>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#374151' }}>{meeting.title || 'Meeting'}</div>
          <div style={{ marginTop: 10, fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
            Started by <strong>{meeting.started_by_name || 'Admin'}</strong>
          </div>
          <div style={{ marginTop: 18, padding: '12px 16px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#94a3b8' }}>Elapsed</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#0f172a', marginTop: 2 }}><ElapsedTicker since={meeting.started_at} /></div>
          </div>
          <p style={{ margin: '18px 0 0', fontSize: 13.5, color: '#475569', lineHeight: 1.6 }}>
            The entire team is paused for this meeting. Live counters (idle, calls, breaks) are frozen and will resume automatically once the meeting ends.
          </p>
          {canStop && (
            <button
              onClick={stop}
              disabled={stopping}
              style={{ marginTop: 22, width: '100%', padding: '13px 0', borderRadius: 11, border: 'none', background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 800, cursor: stopping ? 'default' : 'pointer', fontFamily: 'inherit', boxShadow: '0 8px 20px rgba(220,38,38,.3)' }}
            >
              {stopping ? 'Ending…' : '⏹ End Meeting'}
            </button>
          )}
          {!canStop && (
            <div style={{ marginTop: 20, fontSize: 12, fontWeight: 600, color: '#98a2b3' }}>
              Please wait — this popup will close automatically when an admin ends the meeting.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}