import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ClipboardList,
  File,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Trash2,
  UserCheck,
  Users,
  Webhook,
  X,
} from 'lucide-react'
import { Badge, Card, Empty, ErrorNote, Field, Spinner, errorMessage, fmtTime } from '../ui'
import { gateway } from '../gateway'
import { useSessions } from '../useSessions'

function SessionPicker({ sessions, sessionId, setSessionId, children }) {
  return (
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
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* Broadcast (single + bulk)                                           */
/* ------------------------------------------------------------------ */

const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024
const BULK_CHUNK_SIZE = 100

function toChatId(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  if (trimmed.includes('@')) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  return digits ? `${digits}@c.us` : ''
}

function parseRecipients(value) {
  const seen = new Set()
  const out = []
  // One recipient per line or comma: a line like "+91 98765 43211" is one number,
  // so internal spaces must not split it.
  for (const line of String(value || '').split(/[\n,;]+/)) {
    const chatId = toChatId(line)
    if (!chatId || seen.has(chatId)) continue
    seen.add(chatId)
    out.push(chatId)
  }
  return out
}

function chunk(list, size) {
  const chunks = []
  for (let index = 0; index < list.length; index += size) chunks.push(list.slice(index, index + size))
  return chunks
}

function mergeBatchStatus(batches) {
  const progress = { total: 0, sent: 0, failed: 0, pending: 0, cancelled: 0 }
  const results = []
  for (const batch of batches) {
    for (const key of Object.keys(progress)) progress[key] += Number(batch?.progress?.[key]) || 0
    results.push(...(batch?.results || []))
  }
  const statuses = batches.map((batch) => batch?.status)
  const terminal = statuses.length > 0 && statuses.every((status) => ['completed', 'cancelled', 'failed'].includes(status))
  let status = 'processing'
  if (terminal) {
    status = statuses.includes('failed') ? 'failed' : statuses.includes('cancelled') ? 'cancelled' : 'completed'
  } else if (statuses.includes('pending')) {
    status = 'pending'
  }
  return { status, progress, results }
}

function AttachmentChip({ attach, onRemove }) {
  if (!attach) return null
  return (
    <div className="owa-attachment-chip">
      {attach.preview ? <img src={attach.preview} alt="preview" /> : <File size={16} />}
      <strong>{attach.filename}</strong>
      <span>{Math.round(attach.size / 1024)} KB · {attach.kind}</span>
      <button className="owa-icon-btn" title="Remove attachment" onClick={onRemove}>
        <Trash2 size={12} />
      </button>
    </div>
  )
}

export function BroadcastSection() {
  const { sessions, sessionId, setSessionId, error: sessionError } = useSessions()
  const [mode, setMode] = useState('single')
  const [text, setText] = useState('')
  const [attach, setAttach] = useState(null)
  const [error, setError] = useState('')
  const fileInput = useRef(null)

  const [recipient, setRecipient] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  const [recipientsText, setRecipientsText] = useState('')
  const [delay, setDelay] = useState(3000)
  const [randomize, setRandomize] = useState(true)
  const [stopOnError, setStopOnError] = useState(false)
  const [starting, setStarting] = useState(false)
  const [batchIds, setBatchIds] = useState([])
  const [batch, setBatch] = useState(null)

  const recipients = useMemo(() => parseRecipients(recipientsText), [recipientsText])

  useEffect(() => {
    setBatchIds([])
    setBatch(null)
    setResult(null)
  }, [sessionId])

  const pickFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError('Attachment is too large. Maximum 6 MB.')
      return
    }
    const kind = file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
          ? 'audio'
          : 'document'
    const reader = new FileReader()
    reader.onerror = () => setError('Could not read that file.')
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      setAttach({
        kind,
        base64: dataUrl.split(',')[1] || '',
        mimetype: file.type || 'application/octet-stream',
        filename: file.name,
        size: file.size,
        preview: kind === 'image' ? dataUrl : null,
      })
    }
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    if (!batchIds.length || !sessionId) return undefined
    let cancelled = false
    let timer
    const poll = async () => {
      try {
        const statuses = await Promise.all(batchIds.map((id) => gateway.batchStatus(sessionId, id)))
        if (cancelled) return
        const merged = mergeBatchStatus(statuses)
        setBatch(merged)
        if (['completed', 'cancelled', 'failed'].includes(merged.status)) clearInterval(timer)
      } catch (err) {
        if (!cancelled) setError(errorMessage(err))
      }
    }
    poll()
    timer = setInterval(poll, 2500)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [batchIds, sessionId])

  const sendSingle = async () => {
    if (!sessionId) return
    const chatId = toChatId(recipient)
    if (!chatId) {
      setError('Enter a valid recipient number or chat ID.')
      return
    }
    if (!text.trim() && !attach) return
    setSending(true)
    setResult(null)
    setError('')
    try {
      if (attach) {
        const payload = { chatId, base64: attach.base64, mimetype: attach.mimetype, filename: attach.filename }
        if (attach.kind !== 'audio' && text.trim()) payload.caption = text.trim()
        const data = await gateway.sendMedia(sessionId, attach.kind, payload)
        setResult({ chatId, data })
      } else {
        const data = await gateway.sendText(sessionId, chatId, text.trim())
        setResult({ chatId, data })
      }
      setText('')
      setAttach(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  const startBulk = async () => {
    if (!sessionId) return
    if (recipients.length === 0) {
      setError('Add at least one recipient.')
      return
    }
    if (recipients.length > 500) {
      setError('Maximum 500 recipients per run.')
      return
    }
    if (!text.trim() && !attach) {
      setError('Add a message or an attachment.')
      return
    }
    setStarting(true)
    setError('')
    setBatch(null)
    setBatchIds([])
    try {
      const ids = []
      for (const group of chunk(recipients, BULK_CHUNK_SIZE)) {
        const messages = group.map((chatId) => ({
          chatId,
          type: attach ? attach.kind : 'text',
          content: attach
            ? {
                [attach.kind]: { base64: attach.base64, mimetype: attach.mimetype, filename: attach.filename },
                ...(attach.kind !== 'audio' && text.trim() ? { caption: text.trim() } : {}),
              }
            : { text: text.trim() },
        }))
        const response = await gateway.sendBulk(sessionId, messages, {
          delayBetweenMessages: Math.min(60000, Math.max(1000, Number(delay) || 3000)),
          randomizeDelay: randomize,
          stopOnError,
        })
        if (response?.batchId) ids.push(response.batchId)
      }
      setBatchIds(ids)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setStarting(false)
    }
  }

  const cancelBulk = async () => {
    if (!batchIds.length) return
    try {
      await Promise.all(batchIds.map((id) => gateway.cancelBatch(sessionId, id).catch(() => null)))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const progress = batch?.progress
  const done = progress ? progress.sent + progress.failed + progress.cancelled : 0
  const progressPercent = progress?.total ? Math.round((done / progress.total) * 100) : 0

  return (
    <div className="owa-page">
      <ErrorNote error={sessionError || error} onRetry={() => setError('')} />

      <div className="owa-tabs">
        <button className={`owa-tab ${mode === 'single' ? 'active' : ''}`} onClick={() => setMode('single')}>
          Single message
        </button>
        <button className={`owa-tab ${mode === 'bulk' ? 'active' : ''}`} onClick={() => setMode('bulk')}>
          Bulk broadcast
        </button>
      </div>

      <Card
        title={mode === 'single' ? 'Send a message' : 'Bulk broadcast'}
        subtitle={
          mode === 'single'
            ? 'Send a text, image, video, audio file or document through a connected session.'
            : 'Send the same message to a list of numbers. Batches of 100 are queued automatically.'
        }
      >
        <div className="owa-form-grid">
          <div className="span-2">
            <SessionPicker sessions={sessions} sessionId={sessionId} setSessionId={setSessionId} />
          </div>

          {mode === 'single' ? (
            <Field label="Recipient" hint="e.g. 919876543210, or 1234567890@c.us">
              <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="919876543210" />
            </Field>
          ) : (
            <div className="span-2">
              <Field
                label={`Recipients (${recipients.length})`}
                hint="One per line or comma separated. Numbers get @c.us; full JIDs are kept. Max 500 per run."
              >
                <textarea
                  value={recipientsText}
                  onChange={(event) => setRecipientsText(event.target.value)}
                  placeholder={'919876543210\n447700900123'}
                  style={{ minHeight: 100 }}
                />
              </Field>
              {recipients.length > 0 && (
                <div className="owa-recipients-preview" style={{ marginTop: 8 }}>
                  {recipients.map((chatId) => (
                    <Badge key={chatId} tone="neutral">{chatId}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="span-2">
            <Field label={mode === 'bulk' ? 'Message (caption for media)' : 'Message'}>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Write your message…"
              />
            </Field>
          </div>

          <div className="span-2">
            <div className="owa-toolbar">
              <input
                ref={fileInput}
                type="file"
                className="owa-file-input"
                onChange={pickFile}
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
              />
              <button className="owa-btn" onClick={() => fileInput.current?.click()}>
                <Paperclip size={14} /> Attach media
              </button>
              <span className="owa-small owa-muted">Max 6 MB per attachment</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <AttachmentChip attach={attach} onRemove={() => setAttach(null)} />
            </div>
          </div>

          {mode === 'bulk' && (
            <>
              <Field label="Delay between messages (ms)" hint="1000 – 60000. Default 3000.">
                <input
                  type="number"
                  min="1000"
                  max="60000"
                  step="500"
                  value={delay}
                  onChange={(event) => setDelay(event.target.value)}
                />
              </Field>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
                <label className="owa-check">
                  <input type="checkbox" checked={randomize} onChange={(event) => setRandomize(event.target.checked)} />
                  Randomize delay (0–2 s extra)
                </label>
                <label className="owa-check">
                  <input type="checkbox" checked={stopOnError} onChange={(event) => setStopOnError(event.target.checked)} />
                  Stop on first error
                </label>
              </div>
            </>
          )}
        </div>

        <div className="owa-toolbar" style={{ marginTop: 14 }}>
          {mode === 'single' ? (
            <button
              className="owa-btn owa-btn-primary"
              onClick={sendSingle}
              disabled={sending || !sessionId || !toChatId(recipient) || (!text.trim() && !attach)}
            >
              {sending ? <Spinner size={14} /> : <Send size={14} />} Send message
            </button>
          ) : (
            <>
              <button
                className="owa-btn owa-btn-primary"
                onClick={startBulk}
                disabled={starting || !sessionId || recipients.length === 0 || (!text.trim() && !attach)}
              >
                {starting ? <Spinner size={14} /> : <Send size={14} />} Start broadcast
              </button>
              {batchIds.length > 0 && !['completed', 'cancelled', 'failed'].includes(batch?.status) && (
                <button className="owa-btn owa-btn-danger" onClick={cancelBulk}>
                  <X size={14} /> Cancel
                </button>
              )}
            </>
          )}
          {result && <Badge tone="ok">Sent to {result.chatId}</Badge>}
        </div>

        {result?.data && mode === 'single' && (
          <pre className="owa-code" style={{ marginTop: 12 }}>{JSON.stringify(result.data, null, 2)}</pre>
        )}
      </Card>

      {mode === 'bulk' && batch && (
        <Card
          title="Broadcast progress"
          subtitle={`${batch.progress.sent} sent · ${batch.progress.failed} failed · ${batch.progress.pending} pending · ${batch.progress.cancelled} cancelled`}
          actions={<Badge tone={batch.status === 'completed' ? 'ok' : batch.status === 'failed' ? 'bad' : batch.status === 'cancelled' ? 'warn' : 'info'}>{batch.status}</Badge>}
        >
          <div className="owa-progress" aria-label={`${progressPercent}% complete`}>
            <i style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="owa-small owa-muted" style={{ marginTop: 6 }}>
            {done} of {batch.progress.total} recipients processed ({progressPercent}%)
          </div>

          {batch.results.length > 0 && (
            <div className="owa-table-wrap" style={{ marginTop: 12 }}>
              <table className="owa-table">
                <thead>
                  <tr><th>Recipient</th><th>Status</th><th>Message ID / error</th><th>Sent at</th></tr>
                </thead>
                <tbody>
                  {batch.results.map((row) => (
                    <tr key={row.chatId}>
                      <td className="owa-mono">{row.chatId}</td>
                      <td>
                        <Badge tone={row.status === 'sent' ? 'ok' : row.status === 'failed' ? 'bad' : 'neutral'}>
                          {row.status}
                        </Badge>
                      </td>
                      <td className="owa-small">
                        {row.error?.message || row.messageId || '—'}
                      </td>
                      <td className="owa-small owa-muted owa-nowrap">
                        {row.sentAt ? new Date(row.sentAt).toLocaleTimeString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}


/* Contacts                                                            */
/* ------------------------------------------------------------------ */

export function ContactsSection() {
  const { sessions, sessionId, setSessionId, error: sessionError } = useSessions()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const load = async () => {
    if (!sessionId) return
    setLoading(true)
    try {
      const data = await gateway.listContacts(sessionId, { limit: 1000 })
      setContacts(Array.isArray(data) ? data : [])
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useLoad(load, [sessionId])

  const toggleBlock = async (contact) => {
    try {
      if (contact.isBlocked) await gateway.unblockContact(sessionId, contact.id)
      else await gateway.blockContact(sessionId, contact.id)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const filtered = contacts.filter((contact) => {
    const query = search.trim().toLowerCase()
    if (!query) return true
    return (
      String(contact.name || '').toLowerCase().includes(query) ||
      String(contact.pushName || '').toLowerCase().includes(query) ||
      String(contact.number || '').includes(query) ||
      String(contact.id || '').toLowerCase().includes(query)
    )
  })

  return (
    <div className="owa-page">
      <ErrorNote error={sessionError || error} onRetry={load} />

      <Card
        title="Contacts"
        subtitle="The address book of the selected session."
        actions={
          <>
            <div className="owa-search">
              <Search size={14} />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search contacts" />
            </div>
            <button className="owa-icon-btn" onClick={load} disabled={loading} title="Refresh">
              {loading ? <Spinner size={14} /> : <RefreshCw size={14} />}
            </button>
          </>
        }
      >
        <SessionPicker sessions={sessions} sessionId={sessionId} setSessionId={setSessionId} />
      </Card>

      <Card title={`${filtered.length} contacts`}>
        {loading && contacts.length === 0 ? (
          <div className="owa-empty"><Spinner size={20} /></div>
        ) : filtered.length === 0 ? (
          <Empty icon={Users} title="No contacts" text="Contacts appear once the session has synced its address book." />
        ) : (
          <div className="owa-table-wrap">
            <table className="owa-table">
              <thead><tr><th>Contact</th><th>Number</th><th>Status</th><th style={{ width: 110 }} /></tr></thead>
              <tbody>
                {filtered.map((contact) => (
                  <tr key={contact.id}>
                    <td>
                      <div className="owa-cell-main">
                        <strong>{contact.name || contact.pushName || contact.id}</strong>
                        <span className="owa-mono">{contact.id}</span>
                      </div>
                    </td>
                    <td className="owa-nowrap">{contact.number || '—'}</td>
                    <td>
                      <div className="owa-toolbar">
                        {contact.isMyContact && <Badge tone="info">Saved</Badge>}
                        {contact.isBlocked ? <Badge tone="bad">Blocked</Badge> : <Badge tone="ok">Allowed</Badge>}
                      </div>
                    </td>
                    <td>
                      <button className="owa-btn owa-btn-sm" onClick={() => toggleBlock(contact)}>
                        {contact.isBlocked ? 'Unblock' : 'Block'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Number checker                                                      */
/* ------------------------------------------------------------------ */

export function NumberCheckerSection() {
  const { sessions, sessionId, setSessionId, error: sessionError } = useSessions()
  const [numbers, setNumbers] = useState('')
  const [checking, setChecking] = useState(false)
  const [results, setResults] = useState([])
  const [error, setError] = useState('')

  const check = async () => {
    const list = numbers
      .split(/[\s,;]+/)
      .map((value) => value.replace(/\D/g, ''))
      .filter(Boolean)
    if (!sessionId || list.length === 0) return
    setChecking(true)
    setResults([])
    setError('')
    const rows = []
    for (const number of list) {
      try {
        const data = await gateway.checkNumber(sessionId, number)
        rows.push({ number, exists: data?.exists === true, whatsappId: data?.whatsappId || null })
      } catch (err) {
        rows.push({ number, exists: false, error: errorMessage(err) })
      }
      setResults([...rows])
    }
    setChecking(false)
  }

  return (
    <div className="owa-page">
      <ErrorNote error={sessionError || error} onRetry={() => setError('')} />

      <Card title="Check WhatsApp numbers" subtitle="Verify which numbers have a WhatsApp account before messaging them.">
        <SessionPicker sessions={sessions} sessionId={sessionId} setSessionId={setSessionId} />
        <div style={{ marginTop: 12 }}>
          <Field label="Phone numbers" hint="One per line, or separated by commas. Digits with country code.">
            <textarea
              value={numbers}
              onChange={(event) => setNumbers(event.target.value)}
              placeholder={'919876543210\n447700900123'}
              style={{ minHeight: 120 }}
            />
          </Field>
        </div>
        <div className="owa-toolbar" style={{ marginTop: 12 }}>
          <button className="owa-btn owa-btn-primary" onClick={check} disabled={checking || !sessionId || !numbers.trim()}>
            {checking ? <Spinner size={14} /> : <UserCheck size={14} />} Check numbers
          </button>
        </div>
      </Card>

      {results.length > 0 && (
        <Card title="Results" subtitle={`${results.filter((row) => row.exists).length} of ${results.length} numbers are on WhatsApp`}>
          <div className="owa-table-wrap">
            <table className="owa-table">
              <thead>
                <tr><th>Number</th><th>On WhatsApp</th><th>WhatsApp ID</th><th>Error</th></tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr key={row.number}>
                    <td className="owa-mono">{row.number}</td>
                    <td><Badge tone={row.exists ? 'ok' : 'bad'}>{row.exists ? 'Yes' : 'No'}</Badge></td>
                    <td className="owa-mono">{row.whatsappId || '—'}</td>
                    <td className="owa-small owa-muted">{row.error || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

export function TemplatesSection() {
  const { sessions, sessionId, setSessionId, error: sessionError } = useSessions()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', body: '', header: '', footer: '' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!sessionId) return
    setLoading(true)
    try {
      const data = await gateway.listTemplates(sessionId)
      setTemplates(Array.isArray(data) ? data : [])
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useLoad(load, [sessionId])

  const create = async () => {
    if (!sessionId || !form.name.trim() || !form.body.trim()) return
    setSaving(true)
    try {
      await gateway.createTemplate(sessionId, {
        name: form.name.trim(),
        body: form.body,
        header: form.header.trim() || null,
        footer: form.footer.trim() || null,
      })
      setForm({ name: '', body: '', header: '', footer: '' })
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (template) => {
    if (!window.confirm(`Delete template "${template.name}"?`)) return
    try {
      await gateway.deleteTemplate(sessionId, template.id)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="owa-page">
      <ErrorNote error={sessionError || error} onRetry={load} />

      <Card
        title="Message templates"
        subtitle="Reusable message bodies stored per session."
        actions={
          <>
            <button className="owa-icon-btn" onClick={load} disabled={loading} title="Refresh">
              {loading ? <Spinner size={14} /> : <RefreshCw size={14} />}
            </button>
            <button className="owa-btn owa-btn-primary" onClick={create} disabled={saving || !sessionId || !form.name.trim() || !form.body.trim()}>
              {saving ? <Spinner size={14} /> : <Plus size={14} />} Add template
            </button>
          </>
        }
      >
        <SessionPicker sessions={sessions} sessionId={sessionId} setSessionId={setSessionId} />

        <div className="owa-form-grid" style={{ marginTop: 14 }}>
          <Field label="Name"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="welcome" /></Field>
          <Field label="Header (optional)"><input value={form.header} onChange={(event) => setForm({ ...form, header: event.target.value })} /></Field>
          <div className="span-2">
            <Field label="Body"><textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder="Hello {{name}}, welcome!" /></Field>
          </div>
          <Field label="Footer (optional)"><input value={form.footer} onChange={(event) => setForm({ ...form, footer: event.target.value })} /></Field>
        </div>
      </Card>

      <Card title="Saved templates">
        {loading && templates.length === 0 ? (
          <div className="owa-empty"><Spinner size={20} /></div>
        ) : templates.length === 0 ? (
          <Empty icon={ClipboardList} title="No templates yet" text="Create one above to reuse it in your messages." />
        ) : (
          <div className="owa-table-wrap">
            <table className="owa-table">
              <thead><tr><th>Name</th><th>Body</th><th>Updated</th><th style={{ width: 60 }} /></tr></thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id}>
                    <td><strong>{template.name}</strong></td>
                    <td style={{ maxWidth: 460 }}><span className="owa-small">{template.body}</span></td>
                    <td className="owa-small owa-muted owa-nowrap">{fmtTime(template.updatedAt || template.createdAt)}</td>
                    <td>
                      <button className="owa-icon-btn danger" title="Delete" onClick={() => remove(template)}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Webhooks                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_EVENTS = 'message.received,message.sent,message.ack,session.status'

export function WebhooksSection() {
  const { sessions, sessionId, setSessionId, error: sessionError } = useSessions()
  const [hooks, setHooks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState(DEFAULT_EVENTS)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  const load = async () => {
    if (!sessionId) return
    setLoading(true)
    try {
      const data = await gateway.listWebhooks(sessionId)
      setHooks(Array.isArray(data) ? data : [])
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useLoad(load, [sessionId])

  const create = async () => {
    if (!sessionId || !url.trim()) return
    setSaving(true)
    setNotice('')
    try {
      await gateway.createWebhook(sessionId, {
        url: url.trim(),
        events: events.split(',').map((value) => value.trim()).filter(Boolean),
      })
      setUrl('')
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (hook) => {
    if (!window.confirm(`Delete webhook ${hook.url}?`)) return
    try {
      await gateway.deleteWebhook(sessionId, hook.id)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const test = async (hook) => {
    setNotice('')
    try {
      const result = await gateway.testWebhook(sessionId, hook.id)
      setNotice(result?.success ? 'Test delivery accepted.' : `Test failed: ${result?.error || 'unknown error'}`)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="owa-page">
      <ErrorNote error={sessionError || error} onRetry={load} />
      {notice && <div className="owa-error" style={{ borderColor: 'rgba(22,163,74,.3)', background: 'rgba(22,163,74,.08)', color: '#15803d' }}>{notice}</div>}

      <Card
        title="Webhooks"
        subtitle="POST gateway events to an endpoint you control."
        actions={
          <button className="owa-icon-btn" onClick={load} disabled={loading} title="Refresh">
            {loading ? <Spinner size={14} /> : <RefreshCw size={14} />}
          </button>
        }
      >
        <SessionPicker sessions={sessions} sessionId={sessionId} setSessionId={setSessionId} />
        <div className="owa-form-grid" style={{ marginTop: 14 }}>
          <Field label="Endpoint URL" hint="Must be a reachable http(s) URL.">
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/openwa" />
          </Field>
          <Field label="Events" hint="Comma separated.">
            <input value={events} onChange={(event) => setEvents(event.target.value)} />
          </Field>
        </div>
        <button className="owa-btn owa-btn-primary" style={{ marginTop: 12 }} onClick={create} disabled={saving || !sessionId || !url.trim()}>
          {saving ? <Spinner size={14} /> : <Plus size={14} />} Add webhook
        </button>
      </Card>

      <Card title="Configured webhooks">
        {loading && hooks.length === 0 ? (
          <div className="owa-empty"><Spinner size={20} /></div>
        ) : hooks.length === 0 ? (
          <Empty icon={Webhook} title="No webhooks" text="Add an endpoint above to start receiving events." />
        ) : (
          <div className="owa-table-wrap">
            <table className="owa-table">
              <thead><tr><th>URL</th><th>Events</th><th>Status</th><th>Last triggered</th><th style={{ width: 140 }} /></tr></thead>
              <tbody>
                {hooks.map((hook) => (
                  <tr key={hook.id}>
                    <td className="owa-mono" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{hook.url}</td>
                    <td className="owa-small">{(hook.events || []).join(', ')}</td>
                    <td><Badge tone={hook.active ? 'ok' : 'neutral'}>{hook.active ? 'Active' : 'Paused'}</Badge></td>
                    <td className="owa-small owa-muted owa-nowrap">{fmtTime(hook.lastTriggeredAt)}</td>
                    <td>
                      <div className="owa-row-actions">
                        <button className="owa-btn owa-btn-sm" onClick={() => test(hook)}>Test</button>
                        <button className="owa-icon-btn danger" title="Delete" onClick={() => remove(hook)}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// Small helper so the sections above do not repeat the effect wiring.
function useLoad(fn, deps) {
  useEffect(() => {
    fn()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
