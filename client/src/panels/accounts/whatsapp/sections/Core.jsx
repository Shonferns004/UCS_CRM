import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertCircle,
  Check,
  Copy,
  MessageSquare,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Square,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react'
import {
  Badge,
  Card,
  Empty,
  ErrorNote,
  Field,
  Modal,
  Spinner,
  Stat,
  STATUS_LABELS,
  Toolbar,
  errorMessage,
  fmtNumber,
  fmtTime,
  statusTone,
} from '../ui'
import { gateway } from '../gateway'

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export function OverviewSection({ onNavigate }) {
  const [period, setPeriod] = useState('24h')
  const [overview, setOverview] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [overviewData, messageData] = await Promise.all([
        gateway.overview(),
        gateway.messageStats(period),
      ])
      setOverview(overviewData)
      setStats(messageData)
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    load()
  }, [load])

  const series = useMemo(() => {
    const points = Array.isArray(stats?.timeSeries) ? stats.timeSeries : []
    return points.slice(-28)
  }, [stats])

  const seriesMax = Math.max(1, ...series.map((point) => Math.max(point.sent || 0, point.received || 0)))

  const topChats = Array.isArray(stats?.topChats) ? stats.topChats.slice(0, 8) : []
  const byType = stats?.byType || {}
  const bySession = Array.isArray(stats?.bySession) ? stats.bySession : []

  return (
    <div className="owa-page">
      <ErrorNote error={error} onRetry={load} />

      <div className="owa-stats">
        <Stat label="Sessions" value={fmtNumber(overview?.sessions?.total)} hint={`${fmtNumber(overview?.sessions?.active)} connected`} />
        <Stat label="Sent today" value={fmtNumber(overview?.messages?.today?.sent)} tone="ok" />
        <Stat label="Received today" value={fmtNumber(overview?.messages?.today?.received)} tone="info" />
        <Stat label="Failed sends" value={fmtNumber(overview?.messages?.failed)} tone={overview?.messages?.failed ? 'bad' : ''} />
        <Stat label="All-time sent" value={fmtNumber(overview?.messages?.sent)} />
        <Stat label="All-time received" value={fmtNumber(overview?.messages?.received)} />
      </div>

      <Card
        title="Message volume"
        subtitle="Sent and received messages over the selected period"
        actions={
          <div className="owa-toolbar">
            {['24h', '7d', '30d'].map((value) => (
              <button
                key={value}
                type="button"
                className={`owa-btn owa-btn-sm ${period === value ? 'owa-btn-primary' : ''}`}
                onClick={() => setPeriod(value)}
              >
                {value}
              </button>
            ))}
            <button type="button" className="owa-icon-btn" onClick={load} disabled={loading} title="Refresh">
              {loading ? <Spinner size={14} /> : <RefreshCw size={14} />}
            </button>
          </div>
        }
      >
        {loading && !stats ? (
          <div className="owa-empty"><Spinner size={22} /><span>Loading statistics…</span></div>
        ) : series.length === 0 ? (
          <Empty icon={Activity} title="No message traffic yet" text="Statistics appear once the gateway records messages." />
        ) : (
          <>
            <div className="owa-legend">
              <span><i style={{ background: 'var(--owa-accent)' }} /> Sent</span>
              <span><i style={{ background: 'var(--owa-info)', opacity: 0.6 }} /> Received</span>
            </div>
            <div className="owa-bars">
              {series.map((point, index) => (
                <div className="owa-bar-col" key={`${point.timestamp}-${index}`} title={`${point.timestamp}: sent ${point.sent}, received ${point.received}`}>
                  <div className="owa-bar" style={{ height: `${Math.max(2, (point.sent / seriesMax) * 100)}%` }} />
                  <div className="owa-bar in" style={{ height: `${Math.max(2, (point.received / seriesMax) * 100)}%` }} />
                </div>
              ))}
            </div>
            <div className="owa-bar-label">
              <span>{series[0]?.timestamp}</span>
              <span>{series[series.length - 1]?.timestamp}</span>
            </div>
          </>
        )}
      </Card>

      <div className="owa-split">
        <Card title="Top chats" subtitle="Most active conversations in this period">
          {topChats.length === 0 ? (
            <Empty icon={MessageSquare} title="No chats yet" text="Conversations show up here after the first message." />
          ) : (
            <div className="owa-list">
              {topChats.map((chat) => (
                <div className="owa-list-row" key={chat.chatId}>
                  <div className="owa-cell-main">
                    <strong>{chat.chatName || chat.chatId}</strong>
                    <span className="owa-mono">{chat.chatId}</span>
                  </div>
                  <Badge tone="info">{chat.messageCount}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Breakdown" subtitle="Messages by type and by session">
          <div className="owa-list">
            {Object.entries(byType).slice(0, 6).map(([type, count]) => (
              <div className="owa-list-row" key={type}>
                <span style={{ textTransform: 'capitalize' }}>{type}</span>
                <Badge>{fmtNumber(count)}</Badge>
              </div>
            ))}
            {bySession.slice(0, 6).map((session) => (
              <div className="owa-list-row" key={session.sessionId}>
                <span>{session.name}</span>
                <span className="owa-small owa-muted">
                  {fmtNumber(session.sent)} sent · {fmtNumber(session.received)} received
                </span>
              </div>
            ))}
            {Object.keys(byType).length === 0 && bySession.length === 0 && (
              <p className="owa-muted owa-small">No breakdown available yet.</p>
            )}
          </div>
        </Card>
      </div>

      <Card title="Quick actions">
        <Toolbar>
          <button className="owa-btn owa-btn-primary" onClick={() => onNavigate('sessions')}>
            <Smartphone size={15} /> Manage sessions
          </button>
          <button className="owa-btn" onClick={() => onNavigate('chats')}>
            <MessageSquare size={15} /> Open chats
          </button>
          <button className="owa-btn" onClick={() => onNavigate('message-tester')}>
            <Send size={15} /> Send a message
          </button>
          <button className="owa-btn" onClick={() => onNavigate('number-checker')}>
            Check a number
          </button>
        </Toolbar>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

const POLL_MS = 5000
const QR_REFRESH_MS = 12000

export function SessionsSection() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [search, setSearch] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [creating, setCreating] = useState(false)

  const [qr, setQr] = useState(null) // { id, name, code, status, loading }
  const [pairing, setPairing] = useState(null) // { id, name, phone, code, loading }
  const [config, setConfig] = useState(null) // { id, name, values, loading, saving }
  const [copied, setCopied] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await gateway.listSessions()
      setSessions(Array.isArray(data) ? data : [])
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(() => load(true), POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return sessions
    return sessions.filter(
      (session) =>
        String(session.name || '').toLowerCase().includes(query) ||
        String(session.phone || '').includes(query) ||
        String(session.id || '').toLowerCase().includes(query),
    )
  }, [sessions, search])

  const connected = sessions.filter((session) => session.status === 'ready').length

  const run = async (id, action, options = {}) => {
    if (options.confirm && !window.confirm(options.confirm)) return
    setBusyId(id)
    try {
      const result = await action()
      await load(true)
      if (options.onSuccess) await options.onSuccess(result)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const openQr = async (session) => {
    setQr({ id: session.id, name: session.name || session.id, code: null, status: session.status, loading: true })
    try {
      const data = await gateway.getQr(session.id)
      setQr((current) => (current && current.id === session.id ? { ...current, code: data?.qrCode || null, status: data?.status || current.status, loading: false } : current))
    } catch (err) {
      setQr((current) => (current ? { ...current, loading: false, error: errorMessage(err) } : current))
    }
  }

  useEffect(() => {
    if (!qr) return undefined
    const timer = setInterval(async () => {
      try {
        const data = await gateway.getQr(qr.id)
        setQr((current) => (current && current.id === qr.id ? { ...current, code: data?.qrCode || current.code, status: data?.status || current.status } : current))
      } catch {
        /* a 409/400 while waiting is normal */
      }
    }, QR_REFRESH_MS)
    return () => clearInterval(timer)
  }, [qr?.id])

  const createSession = async () => {
    const name = createName.trim()
    if (!name) return
    setCreating(true)
    try {
      await gateway.createSession(name)
      setCreateName('')
      setCreateOpen(false)
      await load(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  const openConfig = async (session) => {
    setConfig({ id: session.id, name: session.name, values: null, loading: true, saving: false })
    try {
      const values = await gateway.getConfig(session.id)
      setConfig((current) => (current && current.id === session.id ? { ...current, values, loading: false } : current))
    } catch (err) {
      setConfig((current) => (current ? { ...current, loading: false, error: errorMessage(err) } : current))
    }
  }

  const saveConfig = async () => {
    if (!config?.values) return
    setConfig((current) => ({ ...current, saving: true }))
    try {
      const { autoRejectCalls, maxReconnectAttempts, reconnectBaseDelay } = config.values
      const updated = await gateway.updateConfig(config.id, { autoRejectCalls, maxReconnectAttempts, reconnectBaseDelay })
      setConfig((current) => ({ ...current, values: updated, saving: false }))
    } catch (err) {
      setError(errorMessage(err))
      setConfig((current) => ({ ...current, saving: false }))
    }
  }

  const requestPairing = async () => {
    const phone = String(pairing?.phone || '').replace(/\D/g, '')
    if (!phone) return
    setPairing((current) => ({ ...current, loading: true, code: null }))
    try {
      const data = await gateway.requestPairingCode(pairing.id, phone)
      setPairing((current) => ({ ...current, loading: false, code: data?.pairingCode || null }))
    } catch (err) {
      setPairing((current) => ({ ...current, loading: false, error: errorMessage(err) }))
    }
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(pairing?.code || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard may be unavailable */
    }
  }

  return (
    <div className="owa-page">
      <ErrorNote error={error} onRetry={() => load()} />

      <div className="owa-stats">
        <Stat label="Total sessions" value={sessions.length} />
        <Stat label="Connected" value={connected} tone="ok" />
        <Stat label="Waiting for QR" value={sessions.filter((s) => s.status === 'qr_ready').length} tone="info" />
        <Stat label="Disconnected" value={sessions.filter((s) => ['disconnected', 'failed'].includes(s.status)).length} />
      </div>

      <Card
        title="WhatsApp sessions"
        subtitle="Create a session, start it, then scan the QR code with WhatsApp."
        actions={
          <>
            <div className="owa-search">
              <Search size={14} />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search sessions"
              />
            </div>
            <button className="owa-icon-btn" onClick={() => load()} disabled={loading} title="Refresh">
              {loading ? <Spinner size={14} /> : <RefreshCw size={14} />}
            </button>
            <button className="owa-btn owa-btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus size={15} /> New session
            </button>
          </>
        }
      >
        {loading && sessions.length === 0 ? (
          <div className="owa-empty"><Spinner size={22} /><span>Loading sessions…</span></div>
        ) : filtered.length === 0 ? (
          <Empty
            icon={Smartphone}
            title={sessions.length === 0 ? 'No sessions yet' : 'No matching sessions'}
            text={sessions.length === 0 ? 'Create a session to link a WhatsApp number to this account.' : 'Try a different search.'}
            action={
              sessions.length === 0 ? (
                <button className="owa-btn owa-btn-primary" onClick={() => setCreateOpen(true)}>
                  <Plus size={15} /> Create session
                </button>
              ) : null
            }
          />
        ) : (
          <div className="owa-table-wrap">
            <table className="owa-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Status</th>
                  <th>Phone</th>
                  <th>Last active</th>
                  <th style={{ width: 220 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((session) => {
                  const busy = busyId === session.id
                  const canStart = ['created', 'disconnected', 'failed', 'action_required'].includes(session.status)
                  const canStop = ['ready', 'qr_ready', 'initializing', 'authenticating'].includes(session.status)
                  return (
                    <tr key={session.id}>
                      <td>
                        <div className="owa-cell-main">
                          <strong>{session.name || 'Unnamed session'}</strong>
                          <span className="owa-mono">{session.id}</span>
                        </div>
                      </td>
                      <td>
                        <div className="owa-cell-main">
                          <Badge tone={statusTone(session.status)}>{STATUS_LABELS[session.status] || session.status}</Badge>
                          {session.lastError && <span title={session.lastError} style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.lastError}</span>}
                        </div>
                      </td>
                      <td className="owa-nowrap">{session.phone || '—'}</td>
                      <td className="owa-nowrap owa-muted owa-small">{fmtTime(session.lastActive || session.updatedAt)}</td>
                      <td>
                        <div className="owa-row-actions">
                          {canStart && (
                            <button
                              className="owa-icon-btn"
                              title="Start session"
                              disabled={busy}
                              onClick={() => run(session.id, () => gateway.startSession(session.id), {
                                onSuccess: (result) => {
                                  if (result?.status === 'qr_ready') openQr({ ...session, status: result.status })
                                },
                              })}
                            >
                              {busy ? <Spinner size={13} /> : <Play size={13} />}
                            </button>
                          )}
                          {canStop && (
                            <button
                              className="owa-icon-btn"
                              title="Stop session"
                              disabled={busy}
                              onClick={() => run(session.id, () => gateway.stopSession(session.id), { confirm: 'Stop this session? WhatsApp stays linked but the engine goes offline.' })}
                            >
                              {busy ? <Spinner size={13} /> : <Square size={13} />}
                            </button>
                          )}
                          {['qr_ready', 'authenticating', 'initializing'].includes(session.status) && (
                            <button className="owa-icon-btn" title="Show QR code" onClick={() => openQr(session)}>
                              <QrCode size={13} />
                            </button>
                          )}
                          <button className="owa-icon-btn" title="Pairing code" onClick={() => setPairing({ id: session.id, name: session.name, phone: '', code: null, loading: false })}>
                            <Smartphone size={13} />
                          </button>
                          <button className="owa-icon-btn" title="Session settings" onClick={() => openConfig(session)}>
                            <Activity size={13} />
                          </button>
                          <button
                            className="owa-icon-btn"
                            title="Log out of WhatsApp"
                            disabled={busy}
                            onClick={() => run(session.id, () => gateway.logoutSession(session.id), { confirm: 'Log out of WhatsApp? This unlinks the device and requires a new QR scan.' })}
                          >
                            <WifiOff size={13} />
                          </button>
                          <button
                            className="owa-icon-btn danger"
                            title="Delete session"
                            disabled={busy}
                            onClick={() => run(session.id, () => gateway.deleteSession(session.id), { confirm: 'Delete this session permanently? This cannot be undone.' })}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {createOpen && (
        <Modal
          title="New session"
          subtitle="Give the WhatsApp session a name."
          onClose={() => setCreateOpen(false)}
          footer={
            <>
              <button className="owa-btn" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button className="owa-btn owa-btn-primary" onClick={createSession} disabled={creating || !createName.trim()}>
                {creating ? <Spinner size={14} /> : <Plus size={14} />} Create
              </button>
            </>
          }
        >
          <Field label="Session name" hint="Any label, symbols and spaces included. Example: Hiral 1 · BFD/BOD">
            <input
              autoFocus
              value={createName}
              maxLength={50}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="Hiral 1 · BFD/BOD"
              onKeyDown={(event) => event.key === 'Enter' && createSession()}
            />
          </Field>
        </Modal>
      )}

      {qr && (
        <Modal
          title={`Scan QR — ${qr.name}`}
          subtitle="Open WhatsApp → Linked devices → Link a device, then scan this code."
          onClose={() => setQr(null)}
          footer={
            <>
              <button className="owa-btn" onClick={() => setQr(null)}>Close</button>
              <button className="owa-btn owa-btn-primary" onClick={() => openQr({ id: qr.id, name: qr.name })} disabled={qr.loading}>
                <RefreshCw size={14} /> Refresh
              </button>
            </>
          }
        >
          <div className="owa-qr-frame">
            {qr.loading ? (
              <Spinner size={26} />
            ) : qr.code ? (
              <img src={qr.code} alt="WhatsApp pairing QR code" />
            ) : (
              <Empty
                icon={QrCode}
                title="No QR code available"
                text={qr.error || 'Start the session first, then refresh this dialog.'}
              />
            )}
          </div>
          <div className="owa-toolbar">
            <Badge tone={statusTone(qr.status)}>{STATUS_LABELS[qr.status] || qr.status || 'Unknown'}</Badge>
            <span className="owa-small owa-muted">The code refreshes automatically while this dialog is open.</span>
          </div>
        </Modal>
      )}

      {pairing && (
        <Modal
          title={`Pairing code — ${pairing.name || 'session'}`}
          subtitle="Enter the phone number with country code, then type the code on the WhatsApp screen."
          onClose={() => setPairing(null)}
          footer={
            <>
              <button className="owa-btn" onClick={() => setPairing(null)}>Close</button>
              <button className="owa-btn owa-btn-primary" onClick={requestPairing} disabled={pairing.loading || !pairing.phone}>
                {pairing.loading ? <Spinner size={14} /> : <Smartphone size={14} />} Get code
              </button>
            </>
          }
        >
          <Field label="Phone number" hint="Digits with country code, e.g. 919876543210">
            <input
              value={pairing.phone}
              onChange={(event) => setPairing((current) => ({ ...current, phone: event.target.value }))}
              placeholder="919876543210"
              inputMode="numeric"
            />
          </Field>
          {pairing.code && (
            <>
              <div className="owa-pairing-code">{pairing.code}</div>
              <button className="owa-btn owa-btn-ghost" onClick={copyCode}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy code'}
              </button>
            </>
          )}
          {pairing.error && <ErrorNote error={pairing.error} />}
        </Modal>
      )}

      {config && (
        <Modal
          title={`Settings — ${config.name || 'session'}`}
          subtitle="Tunable reconnect behaviour. Saved values apply on the next start."
          onClose={() => setConfig(null)}
          footer={
            <>
              <button className="owa-btn" onClick={() => setConfig(null)}>Close</button>
              <button className="owa-btn owa-btn-primary" onClick={saveConfig} disabled={config.loading || config.saving}>
                {config.saving ? <Spinner size={14} /> : <Check size={14} />} Save
              </button>
            </>
          }
        >
          {config.loading ? (
            <div className="owa-empty"><Spinner size={22} /></div>
          ) : config.error ? (
            <ErrorNote error={config.error} />
          ) : (
            <div className="owa-form-grid">
              <label className="owa-check span-2">
                <input
                  type="checkbox"
                  checked={!!config.values?.autoRejectCalls}
                  onChange={(event) =>
                    setConfig((current) => ({ ...current, values: { ...current.values, autoRejectCalls: event.target.checked } }))
                  }
                />
                Auto-reject incoming calls
              </label>
              <Field label="Max reconnect attempts" hint="Empty means unlimited (default).">
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={config.values?.maxReconnectAttempts ?? ''}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      values: { ...current.values, maxReconnectAttempts: event.target.value === '' ? null : Number(event.target.value) },
                    }))
                  }
                />
              </Field>
              <Field label="Reconnect base delay (ms)">
                <input
                  type="number"
                  min="0"
                  value={config.values?.reconnectBaseDelay ?? ''}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      values: { ...current.values, reconnectBaseDelay: Number(event.target.value) },
                    }))
                  }
                />
              </Field>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
