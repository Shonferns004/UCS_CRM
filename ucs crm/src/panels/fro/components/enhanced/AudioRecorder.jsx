import { useState, useRef, useEffect } from 'react'

export default function AudioRecorder({ onSend, onClose }) {
  const [state, setState] = useState('idle')
  const [duration, setDuration] = useState(0)
  const [audioUrl, setAudioUrl] = useState(null)
  const [audioBlob, setAudioBlob] = useState(null)
  const mediaRecorder = useRef(null)
  const chunks = useRef([])
  const timerRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => {
    startRecording()
    return () => cleanup()
  }, [])

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    if (audioUrl) URL.revokeObjectURL(audioUrl)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg; codecs=opus') ? 'audio/ogg; codecs=opus' : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm'
const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorder.current = recorder
      chunks.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: recorder.mimeType })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        setState('preview')
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      }

      recorder.start()
      setState('recording')
      let sec = 0
      timerRef.current = setInterval(() => { sec++; setDuration(sec) }, 1000)
    } catch (err) {
      alert('Microphone access denied: ' + err.message)
      onClose()
    }
  }

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }

  const handleSend = () => {
    if (audioBlob) {
      const file = new File([audioBlob], `audio_${Date.now()}.webm`, { type: audioBlob.type })
      onSend(file)
    }
    cleanup()
    onClose()
  }

  const formatTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  return (
    <div style={{ padding: '8px 12px', borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
      {state === 'recording' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{formatTime(duration)}</span>
          <div style={{ flex: 1, height: 30, display: 'flex', alignItems: 'center', gap: 1 }}>
            {Array.from({ length: 40 }).map((_, i) => (
              <div key={i} style={{ width: 3, borderRadius: 2, background: '#25D366', height: `${Math.random() * 100}%`, transition: 'height 0.1s' }} />
            ))}
          </div>
          <button onClick={stopRecording} style={{ border: 'none', borderRadius: '50%', width: 36, height: 36, background: '#ef4444', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
          </button>
        </div>
      )}
      {state === 'preview' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => { cleanup(); onClose() }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', padding: 4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 8, background: '#fff' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            <audio src={audioUrl} controls style={{ flex: 1, height: 36 }} />
          </div>
          <button onClick={handleSend} style={{ border: 'none', borderRadius: '50%', width: 36, height: 36, background: '#25D366', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      )}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}
