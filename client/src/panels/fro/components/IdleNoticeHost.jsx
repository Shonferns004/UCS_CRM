import { useEffect, useState } from 'react'
import { useCall } from '../CallContext'
import { getUser } from '../api/auth'
import { istDateString } from '../utils/time'

// Fires once the SERVER-stamped open idle stretch (idle_since from
// toStatusPayload — the same figure the Idle pill and admin boards show) has
// run for an hour. The server owns idle; this component only watches it, so a
// closed tab, a meeting, an admin pause or a Resume all clear the trigger
// exactly when the product says they should.
//
// Shown at most once per IST day per browser: the day's date is written to
// localStorage the moment the modal goes on screen, so F5 or reopening the
// panel mid-stretch cannot bring it back. store.jsx keeps this key across
// logout, so re-logging in the same day stays silent too.
export const IDLE_NOTICE_SECONDS = 3600

const SEEN_KEY_BASE = 'fro_idle1h_seen'
const seenKeyFor = (userId) => (userId ? `${SEEN_KEY_BASE}_v1_${userId}` : null)
const TICK_MS = 30000

export default function IdleNoticeHost() {
  const { isIdle, idleSince } = useCall()
  const user = getUser()
  const seenKey = seenKeyFor(user?.id)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!isIdle || !idleSince || !seenKey) return
    const check = () => {
      const startedMs = Date.parse(idleSince)
      if (!Number.isFinite(startedMs)) return
      if (Date.now() - startedMs < IDLE_NOTICE_SECONDS * 1000) return
      let seen = null
      try { seen = localStorage.getItem(seenKey) } catch (_) { /* private mode */ }
      if (seen === istDateString()) return
      // Stamp BEFORE showing: a refresh the instant it appears must not re-show.
      try { localStorage.setItem(seenKey, istDateString()) } catch (_) { /* private mode */ }
      setShow(true)
    }
    check()
    const t = setInterval(check, TICK_MS)
    return () => clearInterval(t)
  }, [isIdle, idleSince, seenKey])

  if (!show) return null

  const dismiss = () => setShow(false)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99996, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: 'min(460px, 100%)', borderRadius: 18, background: 'var(--card-bg, #fff)', boxShadow: '0 24px 60px rgba(0,0,0,.35)', overflow: 'hidden', animation: 'fro-idle-pop .4s cubic-bezier(.22,1,.36,1)', position: 'relative' }}>
        <style>{'@keyframes fro-idle-pop { 0% { transform: scale(.4); opacity: 0; } 60% { transform: scale(1.06); } 100% { transform: scale(1); opacity: 1; } }'}</style>
        <div style={{ height: 4, background: 'linear-gradient(90deg,#f59e0b,#ef4444)' }} />
        <button onClick={dismiss} aria-label="Close" style={{ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: '50%', background: 'var(--line, #f1f5f9)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink, #0f172a)', fontWeight: 700, fontSize: 14, zIndex: 2 }}>✕</button>
        <div style={{ padding: '24px 24px 0', display: 'flex', alignItems: 'center', flexDirection: 'column', textAlign: 'center' }}>
          <span style={{ width: 46, height: 46, borderRadius: '50%', background: '#fef2f2', border: '2px solid #fca5a5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>!</span>
          <span style={{ marginTop: 10, fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#b91c1c', background: '#fef2f2', padding: '4px 12px', borderRadius: 999 }}>Idle time alert</span>
        </div>
        <div style={{ padding: '14px 24px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--ink, #0f172a)', lineHeight: 1.6 }}>
            Your idle time has reached one hour. If it crosses 1 hour 30 minutes you will receive a warning letter.
          </div>
          <button
            onClick={dismiss}
            style={{ marginTop: 18, width: '100%', padding: '11px 0', borderRadius: 10, border: 'none', background: 'var(--ink, #0f172a)', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}
          >Got it</button>
        </div>
      </div>
    </div>
  )
}
