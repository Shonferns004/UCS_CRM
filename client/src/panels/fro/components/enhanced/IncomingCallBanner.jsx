import { useState } from 'react'
import { answerCall, declineCall } from '../../api/whatsappCalling'

/**
 * Ringing banner for an inbound WhatsApp call.
 *
 * Answering needs the browser to produce a WebRTC answer SDP against Meta's
 * offer, which the overlay normally does. This banner hands off to the same
 * overlay in "answer" mode so there is one implementation of the peer
 * connection, not two.
 */
export default function IncomingCallBanner({ call, conversation, project, agentToken, onAnswered, onDeclined }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [showOverlay, setShowOverlay] = useState(false)

  const name = conversation?.contact?.wa_profile_name
    || conversation?.contact?.name
    || call.contact_wa_id
    || 'Donor'

  const decline = async () => {
    setBusy('decline')
    try {
      await declineCall(call.id, agentToken)
      onDeclined?.()
    } catch (e) {
      setError(e.message)
      setBusy('')
    }
  }

  // The overlay answers when handed the call to connect to.
  if (showOverlay) {
    return (
      <AnswerOverlayHost
        call={call}
        conversation={conversation}
        project={project}
        agentToken={agentToken}
        onClose={() => { setShowOverlay(false); onDeclined?.() }}
        onFailed={(msg) => { setShowOverlay(false); setError(msg) }}
        onAnswered={() => { setShowOverlay(false); onAnswered?.() }}
      />
    )
  }

  return (
    <div style={{
      position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 2500, background: '#fff', borderRadius: 14, padding: '12px 16px',
      boxShadow: '0 12px 36px rgba(0,0,0,.22)', border: '1px solid #e5e7eb',
      display: 'flex', alignItems: 'center', gap: 12, minWidth: 320, maxWidth: '92vw',
    }}>
      <span style={{
        width: 38, height: 38, borderRadius: '50%', background: '#25D366', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        animation: 'wa-pulse 1.2s ease-in-out infinite',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .4-.23.75-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.15-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
        </svg>
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{name}</div>
        <div style={{ fontSize: 11, color: error ? '#b91c1c' : '#6b7280', marginTop: 1 }}>
          {error || 'Incoming WhatsApp call…'}
        </div>
      </div>

      <button
        onClick={decline}
        disabled={!!busy}
        title="Decline"
        style={{
          width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: '#ef4444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: busy === 'decline' ? .6 : 1,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>

      <button
        onClick={() => setShowOverlay(true)}
        disabled={!!busy}
        title="Answer"
        style={{
          width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: '#25D366', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .4-.23.75-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.15-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
        </svg>
      </button>

      <style>{`@keyframes wa-pulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.12) } }`}</style>
    </div>
  )
}

/**
 * Answers the ringing call using the browser's own offer/answer exchange.
 * Kept next to the banner so the peer-connection setup for an inbound call is
 * in one place.
 */
function AnswerOverlayHost({ call, conversation, project, agentToken, onClose, onFailed, onAnswered }) {
  const [status, setStatus] = useState('Answering…')

  const run = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
      })
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      if (pc.iceGatheringState !== 'complete') {
        await new Promise((resolve) => {
          const t = setTimeout(resolve, 3000)
          pc.addEventListener('icegatheringstatechange', () => {
            if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve() }
          })
        })
      }
      setStatus('Connecting…')
      await answerCall(call.id, pc.localDescription?.sdp || offer.sdp, agentToken)
      onAnswered?.()
      // The call is live; the agent can hang up from the history panel.
      setTimeout(() => { stream.getTracks().forEach((t) => t.stop()); onClose?.() }, 2500)
    } catch (e) {
      onFailed?.(e.message)
    }
  }

  return (
    <div onClick={run} style={{
      position: 'fixed', inset: 0, zIndex: 2600, background: 'rgba(15,23,42,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{status}</div>
        <div style={{ fontSize: 12, opacity: .8, marginTop: 6 }}>
          Click to allow microphone access
        </div>
      </div>
    </div>
  )
}
