import { useState, useRef, useEffect, useCallback } from 'react'
import {
  getCallingStatus,
  requestCallPermission,
  startCall,
  answerCall,
  declineCall,
  endCall,
  getCallHistory,
} from '../../api/whatsappCalling'

/**
 * WhatsApp calling overlay.
 *
 * Meta relays only the SDP: the browser builds the WebRTC peer connection and
 * the audio is peer-to-peer, so no media touches the server. That also means
 * the overlay must not assume a connection is up -- it reports what the peer
 * connection actually reports, rather than showing "connected" optimistically.
 */

// STUN only. A symmetric NAT needs a TURN server for the media path to work;
// without one the call can fail to connect even though signalling succeeded.
const RTC_CONFIG = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
}

/**
 * Whether this page can capture a microphone at all.
 *
 * `navigator.mediaDevices` is only exposed in a SECURE CONTEXT: https, or
 * http://localhost / 127.0.0.1. Opened as http://192.168.x.x:5173 — which is how
 * a LAN dev machine is normally reached — the property is simply absent and
 * getUserMedia throws a bare TypeError about `getUserMedia` being undefined.
 * That reads as a code fault on the call screen when it is really the URL bar.
 *
 * Worth checking up front because it is the single most common reason a call
 * "does not connect" on a dev machine: the offer can never be created without a
 * local audio track, so the failure lands after the button rather than before it.
 */
function microphoneBlocked() {
  if (typeof window === 'undefined') return false
  if (!navigator.mediaDevices?.getUserMedia) return true
  if (!window.RTCPeerConnection) return true
  return !window.isSecureContext
}

function micBlockedMessage() {
  if (typeof window !== 'undefined' && !window.RTCPeerConnection) {
    return 'This browser cannot make WebRTC calls.'
  }
  return (
    'Calls need a secure page. Open the app on https:// or on localhost — ' +
    'a plain http:// LAN address (like http://192.168.x.x:5173) blocks the microphone, ' +
    'so no call can connect from here.'
  )
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0))
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const STATE_LABEL = {
  idle: '',
  requesting: 'Starting call…',
  ringing: 'Ringing…',
  incoming: 'Incoming call',
  connecting: 'Connecting…',
  connected: 'Connected',
  ended: 'Call ended',
  declined: 'Declined',
  failed: 'Call failed',
  unavailable: 'Calling unavailable',
}

export default function CallOverlay({ conversationId, contact, project, agentToken, onClose, onChanged }) {
  const [state, setState] = useState('idle')
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [availability, setAvailability] = useState(null)

  const pcRef = useRef(null)
  const streamRef = useRef(null)
  const callRef = useRef(null)
  const timerRef = useRef(null)
  const remoteAudioRef = useRef(null)

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    try { pcRef.current?.close() } catch { /* already closed */ }
    pcRef.current = null
  }, [])

  useEffect(() => {
    // Checked before anything is sent to Meta. Without a local audio track there
    // is no SDP offer to send, so the call could only ever end in "Call failed"
    // with no useful reason attached.
    if (microphoneBlocked()) {
      setError(micBlockedMessage())
      setState('unavailable')
      return cleanup
    }

    setState('requesting')
    getCallingStatus(conversationId, agentToken)
      .then((s) => {
        setAvailability(s)
        if (!s.available) {
          setError(s.reason || 'Calling is not available for this number.')
          setState('unavailable')
        } else {
          startOutbound(s)
        }
      })
      .catch((e) => {
        setError(e.message)
        setState('failed')
      })
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  useEffect(() => {
    if (state !== 'connected') return undefined
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [state])

/** Attach local audio and wait for the offer to be fully gathered. */
async function createPeerConnection() {
  if (microphoneBlocked()) throw new Error(micBlockedMessage())
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    streamRef.current = stream
    const pc = new RTCPeerConnection(RTC_CONFIG)
    pcRef.current = pc
    stream.getTracks().forEach((track) => pc.addTrack(track, stream))

    // Meta's own stream arrives on the track, so it is never muted locally --
    // muting the microphone is what silences us.
    pc.ontrack = (event) => {
      const [remote] = event.streams
      if (remoteAudioRef.current && remote) {
        remoteAudioRef.current.srcObject = remote
        remoteAudioRef.current.play?.().catch(() => {})
      }
    }
    return pc
  }

  /** Trickle ICE would race Meta's relay, so wait for gathering to finish. */
  function waitForIceGathering(pc) {
    if (pc.iceGatheringState === 'complete') return Promise.resolve()
    return new Promise((resolve) => {
      // Guard so a network that never completes cannot hang the button.
      const timer = setTimeout(resolve, 3000)
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timer)
          resolve()
        }
      })
    })
  }

  async function startOutbound() {
    try {
      setState('requesting')
      const pc = await createPeerConnection()
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await waitForIceGathering(pc)

      const result = await startCall(conversationId, pc.localDescription?.sdp || offer.sdp, agentToken)
      callRef.current = result.call
      setState('ringing')
      onChanged?.()
      // Meta answers our offer through the webhook. Applying that answer is what
      // actually completes the WebRTC handshake, so wait for it here -- without
      // this the call rings and then stays silent.
      await waitForRemoteAnswer(pc, result.call.id)
    } catch (e) {
      setError(e.message)
      setState('failed')
    }
  }

  /** Poll the call row until Meta's answer SDP lands, then apply it. */
  async function waitForRemoteAnswer(pc, callId) {
    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500))
      try {
        const { calls } = await getCallHistory({ project, conversationId, limit: 5 }, agentToken)
        const mine = (calls || []).find((c) => c.id === callId)
        if (!mine) continue
        if (mine.status === 'failed' || mine.status === 'terminated' || mine.status === 'rejected') {
          setError(mine.failure_reason || 'The call ended before it connected.')
          setState('failed')
          return
        }
        if (mine.sdp_answer) {
          await pc.setRemoteDescription({ type: 'answer', sdp: mine.sdp_answer })
          setState('connected')
          setSeconds(0)
          onChanged?.()
          return
        }
      } catch {
        // A dropped poll must not abort a call that is still ringing.
      }
    }
    setError('Meta did not send an answer for this call.')
    setState('failed')
  }

  async function acceptIncoming(call) {
    try {
      setState('connecting')
      const pc = await createPeerConnection()
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await waitForIceGathering(pc)
      await answerCall(call.id, pc.localDescription?.sdp || answer.sdp, agentToken)
      callRef.current = call
      setState('connecting')
    } catch (e) {
      setError(e.message)
      setState('failed')
    }
  }

  async function hangUp(reason) {
    try {
      if (callRef.current?.id) await endCall(callRef.current.id, reason, agentToken)
    } catch { /* the call is ending locally regardless */ }
    setState('ended')
    onChanged?.()
    setTimeout(() => { cleanup(); onClose?.() }, reason === 'hangup' ? 400 : 1400)
  }

  async function decline() {
    try {
      if (callRef.current?.id) await declineCall(callRef.current.id, agentToken)
    } catch { /* ending locally regardless */ }
    setState('declined')
    onChanged?.()
    setTimeout(() => { cleanup(); onClose?.() }, 900)
  }

  async function askPermission() {
    try {
      setState('requesting')
      await requestCallPermission(conversationId, agentToken)
      setError('Permission request sent. Ask the donor to accept it in WhatsApp, then call again.')
      setState('unavailable')
    } catch (e) {
      setError(e.message)
      setState('failed')
    }
  }

  const toggleMute = () => {
    const next = !muted
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next })
    setMuted(next)
  }

  const tone = state === 'connected' ? '#25D366' : state === 'failed' || state === 'unavailable' ? '#ef4444' : '#2563eb'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      background: 'rgba(15,23,42,.62)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 18, padding: 28, width: 340, maxWidth: '100%',
        boxShadow: '0 24px 64px rgba(0,0,0,.28)', textAlign: 'center',
      }}>
        <div style={{
          width: 88, height: 88, borderRadius: '50%', margin: '0 auto 16px',
          background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 34, fontWeight: 700, color: '#374151',
        }}>
          {(contact?.wa_profile_name || contact?.name || '?').trim().charAt(0).toUpperCase()}
        </div>

        <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 2 }}>
          {contact?.wa_profile_name || contact?.name || 'Donor'}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
          {contact?.phone_normalized || contact?.phone || ''}
        </div>

        <div style={{ fontSize: 15, fontWeight: 600, color: tone, marginBottom: 6 }}>
          {state === 'connected' ? formatDuration(seconds) : (STATE_LABEL[state] || '')}
        </div>

        {error && (
          <div style={{
            fontSize: 11.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a',
            borderRadius: 8, padding: '8px 10px', marginTop: 6, textAlign: 'left', lineHeight: 1.4,
          }}>
            {error}
          </div>
        )}

        {state === 'unavailable' && availability?.canRequestPermission && (
          <button
            onClick={askPermission}
            style={{
              marginTop: 12, width: '100%', padding: '9px 12px', fontSize: 12.5, fontWeight: 600,
              background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer',
            }}
          >
            Ask the donor for call permission
          </button>
        )}

        <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
          {state === 'connected' && (
            <button
              onClick={toggleMute}
              title={muted ? 'Unmute' : 'Mute'}
              style={{
                width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: muted ? '#ef4444' : '#e5e7eb', color: muted ? '#fff' : '#374151',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                {muted && <line x1="3" y1="3" x2="21" y2="21" />}
              </svg>
            </button>
          )}

          <button
            onClick={() => hangUp('hangup')}
            title="End call"
            style={{
              width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: '#ef4444', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .4-.23.75-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.15-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
            </svg>
          </button>
        </div>

        <button
          onClick={() => { cleanup(); onClose?.() }}
          style={{ marginTop: 14, border: 'none', background: 'transparent', color: '#9ca3af', fontSize: 11.5, cursor: 'pointer' }}
        >
          Close
        </button>
      </div>
    </div>
  )
}

export { formatDuration }
