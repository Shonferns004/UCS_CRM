import { useState, useRef } from 'react'
import { MediaUploadPreview } from './MediaPreview'
import AudioRecorder from './AudioRecorder'

export default function MessageComposer({ onSend, onSendMedia, disabled }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [files, setFiles] = useState([])
  const [showRecorder, setShowRecorder] = useState(false)
  const inputRef = useRef(null)
  const fileRef = useRef(null)

  const handleSend = async () => {
    if ((!text.trim() && files.length === 0) || sending || disabled) return
    setSending(true)
    try {
      if (files.length > 0) {
        if (onSendMedia) await onSendMedia(files)
        setFiles([])
      }
      if (text.trim()) {
        await onSend(text.trim())
        setText('')
      }
      inputRef.current?.focus()
    } catch (err) {
      alert('Failed to send: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || [])
    const validFiles = selected.filter(f => {
      if (f.size > 16 * 1024 * 1024) {
        alert(`File too large: ${f.name}. Max 16MB.`)
        return false
      }
      return true
    })
    setFiles(prev => [...prev, ...validFiles])
    if (fileRef.current) fileRef.current.value = ''
  }

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleAudioRecorded = async (file) => {
    if (onSendMedia) await onSendMedia([file])
    setShowRecorder(false)
  }

  const canSend = ((text.trim().length > 0 || files.length > 0) && !sending && !disabled)

  if (showRecorder) {
    return <AudioRecorder onSend={handleAudioRecorded} onClose={() => setShowRecorder(false)} />
  }

  return (
    <div style={{ padding: '8px 12px', borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
      {files.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {files.map((file, i) => (
            <MediaUploadPreview key={i} file={file} onRemove={() => removeFile(i)} />
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={sending || disabled}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '6px 4px', color: '#6b7280', flexShrink: 0 }}
          title="Attach files"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>
        <input ref={fileRef} type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }} onChange={handleFileChange} />
        <button
          onClick={() => setShowRecorder(true)}
          disabled={sending || disabled}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '6px 4px', color: '#ef4444', flexShrink: 0 }}
          title="Record audio"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </button>
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={sending || disabled}
          rows={1}
          style={{
            flex: 1,
            padding: '8px 12px',
            fontSize: 13,
            border: '1px solid #d1d5db',
            borderRadius: 20,
            outline: 'none',
            resize: 'none',
            fontFamily: 'inherit',
            lineHeight: 1.4,
            maxHeight: 120,
            background: '#fff',
          }}
          onInput={(e) => {
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
          }}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          style={{
            border: 'none',
            borderRadius: '50%',
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: canSend ? '#25D366' : '#d1d5db',
            color: '#fff',
            cursor: canSend ? 'pointer' : 'not-allowed',
            flexShrink: 0,
            transition: 'background .15s',
          }}
        >
          {sending ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeDasharray="30 10">
                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
              </circle>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
