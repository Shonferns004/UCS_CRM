import { useCallback, useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, Play, Plus, RefreshCw, Trash2, Video } from 'lucide-react'
import { Badge, Card, Empty, ErrorNote, Field, Spinner, errorMessage, fmtTime } from '../ui'
import { gateway } from '../gateway'
import { useSessions } from '../useSessions'

const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024

function toJid(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  if (trimmed.includes('@')) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  return digits ? `${digits}@c.us` : ''
}

function parseJids(value) {
  const seen = new Set()
  const out = []
  for (const line of String(value || '').split(/[\n,;]+/)) {
    const jid = toJid(line)
    if (!jid || seen.has(jid)) continue
    seen.add(jid)
    out.push(jid)
  }
  return out
}

function StatusMedia({ sessionId, status }) {
  const [state, setState] = useState({ url: null, failed: false })

  useEffect(() => {
    if (!status.mediaUrl) return undefined
    let alive = true
    let objectUrl = null
    setState({ url: null, failed: false })
    gateway
      .statusMedia(sessionId, status.id)
      .then(async (response) => {
        if (!response.ok) throw new Error('media')
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        if (!alive) {
          URL.revokeObjectURL(url)
          return
        }
        objectUrl = url
        setState({ url, failed: false })
      })
      .catch(() => {
        if (alive) setState({ url: null, failed: true })
      })
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [sessionId, status.id, status.mediaUrl])

  if (!status.mediaUrl) return null
  if (state.failed) return <div className="owa-small owa-muted">Media unavailable</div>
  if (!state.url) return <div className="owa-small owa-muted">Loading media…</div>
  if (status.type === 'image') return <img src={state.url} alt={status.caption || 'Status'} className="owa-status-media" />
  if (status.type === 'video') return <video src={state.url} controls className="owa-status-media" />
  return <audio src={state.url} controls style={{ width: '100%' }} />
}

export default function StatusSection() {
  const { sessions, sessionId, setSessionId, error: sessionError } = useSessions()
  const [statuses, setStatuses] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('text')
  const [text, setText] = useState('')
  const [background, setBackground] = useState('#128c7e')
  const [font, setFont] = useState('0')
  const [caption, setCaption] = useState('')
  const [recipientsText, setRecipientsText] = useState('')
  const [media, setMedia] = useState(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const fileInput = useRef(null)

  const recipients = parseJids(recipientsText)

  const load = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    try {
      const data = await gateway.listStatuses(sessionId)
      setStatuses(Array.isArray(data?.statuses) ? data.statuses : [])
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    setResult(null)
    load()
  }, [load])

  const pickFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError('Attachment is too large. Maximum 6 MB.')
      return
    }
    const kind = file.type.startsWith('video/') ? 'video' : 'image'
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      setError('Pick an image or a video for a status.')
      return
    }
    const reader = new FileReader()
    reader.onerror = () => setError('Could not read that file.')
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      setMedia({
        kind,
        base64: dataUrl.split(',')[1] || '',
        mimetype: file.type,
        filename: file.name,
        size: file.size,
        preview: kind === 'image' ? dataUrl : null,
      })
    }
    reader.readAsDataURL(file)
  }

  const postStatus = async () => {
    if (!sessionId) return
    setSending(true)
    setError('')
    setResult(null)
    try {
      let data
      if (mode === 'text') {
        if (!text.trim()) return
        data = await gateway.sendTextStatus(sessionId, {
          text: text.trim(),
          backgroundColor: background,
          font: Number(font),
          ...(recipients.length ? { recipients } : {}),
        })
      } else {
        if (!media) {
          setError('Pick an image or video first.')
          return
        }
        const payload = {
          [media.kind]: { base64: media.base64, mimetype: media.mimetype },
          ...(caption.trim() ? { caption: caption.trim() } : {}),
          ...(recipients.length ? { recipients } : {}),
        }
        data = media.kind === 'video'
          ? await gateway.sendVideoStatus(sessionId, payload)
          : await gateway.sendImageStatus(sessionId, payload)
      }
      setResult(data)
      setText('')
      setCaption('')
      setMedia(null)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="owa-page">
      <ErrorNote error={sessionError || error} onRetry={load} />

      <Card
        title="Status updates"
        subtitle="Recent stories from your contacts, newest first."
        actions={
          <button className="owa-icon-btn" onClick={load} disabled={loading} title="Refresh">
            {loading ? <Spinner size={14} /> : <RefreshCw size={14} />}
          </button>
        }
      >
        <div className="owa-toolbar">
          <Field label="Session">
            <select value={sessionId} onChange={(event) => setSessionId(event.target.value)} style={{ minWidth: 240 }}>
              {sessions.length === 0 && <option value="">No sessions</option>}
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name} — {session.status}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <div className="owa-status-grid">
        {loading && statuses.length === 0 ? (
          <Card><div className="owa-empty"><Spinner size={20} /></div></Card>
        ) : statuses.length === 0 ? (
          <Card>
            <Empty icon={ImageIcon} title="No status updates" text="Stories from contacts appear here and expire after 24 hours." />
          </Card>
        ) : (
          statuses.map((status) => (
            <div
              key={status.id}
              className={`owa-status-card ${status.type === 'text' ? 'text' : ''}`}
              style={status.type === 'text' ? { background: status.backgroundColor || '#128c7e', color: '#fff' } : undefined}
            >
              <div className="owa-status-head">
                <div className="owa-cell-main">
                  <strong style={status.type === 'text' ? { color: '#fff' } : undefined}>
                    {status.contact?.name || status.contact?.pushName || status.contact?.id}
                  </strong>
                  <span style={status.type === 'text' ? { color: 'rgba(255,255,255,.75)' } : undefined}>
                    {fmtTime(status.timestamp)}
                  </span>
                </div>
                <Badge tone="neutral">
                  {status.type === 'image' ? <ImageIcon size={11} /> : status.type === 'video' ? <Video size={11} /> : <Play size={11} />}
                  {' '}{status.type}
                </Badge>
              </div>
              {status.type !== 'text' && <StatusMedia sessionId={sessionId} status={status} />}
              {(status.caption || status.type === 'text') && (
                <p
                  className="owa-status-caption"
                  style={status.type === 'text' ? { color: '#fff', fontSize: 18, fontWeight: 600 } : undefined}
                >
                  {status.caption}
                </p>
              )}
              <div className="owa-small" style={{ opacity: 0.7, marginTop: 6 }}>
                Expires {fmtTime(status.expiresAt)}
              </div>
            </div>
          ))
        )}
      </div>

      <Card title="Post a status" subtitle="Share a text, image or video status. Recipients are optional and only honored by the Baileys engine.">
        <div className="owa-tabs">
          <button className={`owa-tab ${mode === 'text' ? 'active' : ''}`} onClick={() => setMode('text')}>Text status</button>
          <button className={`owa-tab ${mode === 'media' ? 'active' : ''}`} onClick={() => setMode('media')}>Image / video</button>
        </div>

        {mode === 'text' ? (
          <div className="owa-form-grid" style={{ marginTop: 12 }}>
            <div className="span-2">
              <Field label="Status text" hint="Up to 4096 characters.">
                <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Out for delivery 🚚" />
              </Field>
            </div>
            <Field label="Background colour">
              <input type="color" value={background} onChange={(event) => setBackground(event.target.value)} style={{ height: 38, padding: 3 }} />
            </Field>
            <Field label="Font">
              <select value={font} onChange={(event) => setFont(event.target.value)}>
                <option value="0">Default</option>
                <option value="1">Serif</option>
                <option value="2">Sans</option>
                <option value="6">Bold</option>
                <option value="7">Handwriting</option>
              </select>
            </Field>
          </div>
        ) : (
          <div className="owa-form-grid" style={{ marginTop: 12 }}>
            <div className="span-2">
              <input ref={fileInput} type="file" className="owa-file-input" accept="image/*,video/*" onChange={pickFile} />
              <button className="owa-btn" onClick={() => fileInput.current?.click()}>
                <ImageIcon size={14} /> Choose image or video
              </button>
              <span className="owa-small owa-muted" style={{ marginLeft: 8 }}>Max 6 MB</span>
            </div>
            {media && (
              <div className="span-2">
                <div className="owa-attachment-chip">
                  {media.preview ? <img src={media.preview} alt="preview" /> : <Video size={16} />}
                  <strong>{media.filename}</strong>
                  <span>{Math.round(media.size / 1024)} KB · {media.kind}</span>
                  <button className="owa-icon-btn" onClick={() => setMedia(null)} title="Remove">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )}
            <div className="span-2">
              <Field label="Caption">
                <input value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="New drop!" maxLength={1024} />
              </Field>
            </div>
          </div>
        )}

        <div className="owa-form-grid" style={{ marginTop: 12 }}>
          <div className="span-2">
            <Field label={`Recipients (${recipients.length}, optional)`} hint="Phone numbers or JIDs, one per line or comma separated.">
              <textarea
                value={recipientsText}
                onChange={(event) => setRecipientsText(event.target.value)}
                placeholder={'919876543210\n447700900123'}
                style={{ minHeight: 70 }}
              />
            </Field>
          </div>
        </div>

        <div className="owa-toolbar" style={{ marginTop: 12 }}>
          <button
            className="owa-btn owa-btn-primary"
            onClick={postStatus}
            disabled={sending || !sessionId || (mode === 'text' ? !text.trim() : !media)}
          >
            {sending ? <Spinner size={14} /> : <Plus size={14} />} Post status
          </button>
          {result?.statusId && <Badge tone="ok">Posted · expires {fmtTime(result.expiresAt)}</Badge>}
        </div>
      </Card>
    </div>
  )
}
