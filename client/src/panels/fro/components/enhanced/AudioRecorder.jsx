import { useState, useRef, useEffect } from 'react'
import { Mp3Encoder } from '@breezystack/lamejs'

const MP3_BLOCK = 1152 * 16

function floatToInt16(samples) {
  const int16 = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return int16
}

function encodeMp3(samples, sampleRate) {
  const encoder = new Mp3Encoder(1, sampleRate, 32)
  const int16 = floatToInt16(samples)
  const parts = []
  for (let i = 0; i < int16.length; i += MP3_BLOCK) {
    const chunk = encoder.encodeBuffer(int16.subarray(i, i + MP3_BLOCK))
    if (chunk.length) parts.push(chunk)
  }
  const tail = encoder.flush()
  if (tail.length) parts.push(tail)
  return new Blob(parts, { type: 'audio/mpeg' })
}

export default function AudioRecorder({ onSend, onClose }) {
  const [state, setState] = useState('idle')
  const [duration, setDuration] = useState(0)
  const [audioUrl, setAudioUrl] = useState(null)
  const [audioBlob, setAudioBlob] = useState(null)
  const pcmChunks = useRef([])
  const sampleRate = useRef(44100)
  const timerRef = useRef(null)
  const streamRef = useRef(null)
  const audioCtxRef = useRef(null)
  const sourceRef = useRef(null)
  const processorRef = useRef(null)

  useEffect(() => {
    startRecording()
    return () => cleanup()
  }, [])

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (processorRef.current) processorRef.current.onaudioprocess = null
    try { processorRef.current?.disconnect() } catch { /* already closed */ }
    try { sourceRef.current?.disconnect() } catch { /* already closed */ }
    audioCtxRef.current?.close().catch(() => {})
    streamRef.current?.getTracks().forEach(t => t.stop())
    if (audioUrl) URL.revokeObjectURL(audioUrl)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Capture raw PCM and encode to MP3 ourselves rather than using
      // MediaRecorder's container. Browsers emit audio/mp4 as a FRAGMENTED MP4
      // (a moof box per fragment); Meta's downloader cannot parse that and
      // rejects it with 131053 "Media upload error" -- confirmed against real
      // sends, where every fragmented .m4a failed and every plain .mp3 was
      // delivered. MP3 is on WhatsApp's accepted list, so encode to it directly.
      const Ctor = window.AudioContext || window.webkitAudioContext
      if (!Ctor) throw new Error('audio capture not supported by this browser')
      const ctx = new Ctor({ sampleRate: 44100 })
      await ctx.resume()
      sampleRate.current = ctx.sampleRate || 44100

      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      pcmChunks.current = []
      processor.onaudioprocess = (e) => {
        const channel = e.inputBuffer.getChannelData(0)
        pcmChunks.current.push(new Float32Array(channel))
      }

      source.connect(processor)
      // Route to the destination so the browser keeps the graph running; the
      // mic is not echoed back because nothing plays the node's output.
      processor.connect(ctx.destination)

      sourceRef.current = source
      processorRef.current = processor
      audioCtxRef.current = ctx

      setState('recording')
      let sec = 0
      timerRef.current = setInterval(() => { sec++; setDuration(sec) }, 1000)
    } catch (err) {
      alert('Microphone access denied: ' + err.message)
      onClose()
    }
  }

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (processorRef.current) processorRef.current.onaudioprocess = null
    try { processorRef.current?.disconnect() } catch { /* already closed */ }
    try { sourceRef.current?.disconnect() } catch { /* already closed */ }
    audioCtxRef.current?.close().catch(() => {})
    sourceRef.current = null
    processorRef.current = null
    audioCtxRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null

    const total = pcmChunks.current.reduce((n, c) => n + c.length, 0)
    const merged = new Float32Array(total)
    let off = 0
    for (const c of pcmChunks.current) { merged.set(c, off); off += c.length }
    pcmChunks.current = []

    if (total === 0) {
      alert('Nothing was recorded. Please check your microphone and try again.')
      setState('idle')
      setDuration(0)
      startRecording()
      return
    }

    try {
      const blob = encodeMp3(merged, sampleRate.current)
      setAudioBlob(blob)
      setAudioUrl(URL.createObjectURL(blob))
      setState('preview')
    } catch (err) {
      alert('Voice note encoding failed: ' + err.message)
      setState('idle')
      setDuration(0)
    }
  }

  const handleSend = () => {
    if (audioBlob) {
      const file = new File([audioBlob], `audio_${Date.now()}.mp3`, { type: 'audio/mpeg' })
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
