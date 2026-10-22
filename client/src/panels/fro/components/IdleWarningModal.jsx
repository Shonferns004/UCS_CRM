import { useEffect } from 'react'
import { WARN_TONES, WARN_NEUTRAL } from '../../../utils/warnTone'

// The admin's Warn button lands here.
//
// Clicking Warn on the Telecaller Performance board makes the server push
// `fro:action { type: 'idle_alert', level }` straight into this FRO's own
// `worker:<id>` room, so this modal appears within the socket round-trip — no
// waiting for the 8s notification poll.
//
// Colour and wording escalate together: yellow is a heads-up, orange is a
// warning, red is urgent. The copy is resolved server-side (one canonical text
// per level for the modal, the web bell and the FCM push); this component only
// owns the presentation. A missing/unknown level falls back to a neutral tone so
// an older sender still gets a modal rather than silence.
export default function IdleWarningModal({ warning, onClose }) {
  useEffect(() => {
    if (!warning) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [warning, onClose])

  if (!warning) return null

  const tone = WARN_TONES[warning.level] || WARN_NEUTRAL
  // Above IdleNoticeHost and the broadcast popup (both 99996): an admin's
  // explicit warning must never sit behind another modal.
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="fro-idle-warn-title"
      style={{ position: 'fixed', inset: 0, zIndex: 99997, background: 'rgba(15,23,42,.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ width: 'min(440px, 100%)', borderRadius: 18, background: 'var(--card-bg, #fff)', boxShadow: '0 24px 60px rgba(0,0,0,.4)', overflow: 'hidden', animation: 'fro-warn-pop .38s cubic-bezier(.22,1,.36,1)', position: 'relative' }}>
        <style>{'@keyframes fro-warn-pop { 0% { transform: scale(.5); opacity: 0; } 60% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }'}</style>
        <div style={{ height: 5, background: tone.border }} />
        <button
          onClick={onClose}
          aria-label="Dismiss"
          style={{ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: '50%', background: 'var(--line, #f1f5f9)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink, #0f172a)', fontWeight: 700, fontSize: 14, zIndex: 2 }}
        >✕</button>

        <div style={{ padding: '24px 24px 0', display: 'flex', alignItems: 'center', flexDirection: 'column', textAlign: 'center' }}>
          <span style={{ width: 52, height: 52, borderRadius: '50%', background: tone.soft, border: `2px solid ${tone.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: tone.ink }}>!</span>
          <span style={{ marginTop: 10, fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: tone.ink, background: tone.soft, border: `1px solid ${tone.border}`, padding: '4px 12px', borderRadius: 999 }}>{tone.label}</span>
        </div>

        <div style={{ padding: '14px 24px 24px', textAlign: 'center' }}>
          <h3 id="fro-idle-warn-title" style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 800, color: 'var(--ink, #0f172a)' }}>Idle time warning</h3>
          <div style={{ fontSize: 14.5, fontWeight: 500, color: 'var(--ink, #0f172a)', lineHeight: 1.6 }}>
            {warning.body || 'Your idle time has increased. Please resume your work now.'}
          </div>
          <button
            onClick={onClose}
            style={{ marginTop: 18, width: '100%', padding: '11px 0', borderRadius: 10, border: 'none', background: tone.border, color: tone.fg, fontWeight: 800, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}
          >I&#39;m back to work</button>
        </div>
      </div>
    </div>
  )
}
