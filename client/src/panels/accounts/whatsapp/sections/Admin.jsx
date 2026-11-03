import { useEffect, useState } from 'react'
import { Copy, Key, Plus, Puzzle, RefreshCw, Save, Server, Trash2, Upload } from 'lucide-react'
import { Badge, Card, Empty, ErrorNote, Field, Modal, Spinner, errorMessage, fmtNumber, fmtTime } from '../ui'
import { gateway } from '../gateway'
import { useSessions } from '../useSessions'

/* ------------------------------------------------------------------ */
/* API keys                                                            */
/* ------------------------------------------------------------------ */

export function ApiKeysSection() {
  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('operator')
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState(null)
  const [copied, setCopied] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await gateway.listApiKeys()
      setKeys(Array.isArray(data) ? data : data?.data || [])
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    if (!name.trim()) return
    setSaving(true)
    setCreated(null)
    try {
      const data = await gateway.createApiKey({ name: name.trim(), role })
      setCreated(data)
      setName('')
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const revoke = async (key) => {
    if (!window.confirm(`Revoke API key "${key.name}"? Existing clients stop working immediately.`)) return
    try {
      await gateway.revokeApiKey(key.id)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const remove = async (key) => {
    if (!window.confirm(`Delete API key "${key.name}"?`)) return
    try {
      await gateway.deleteApiKey(key.id)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(created?.apiKey || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="owa-page">
      <ErrorNote error={error} onRetry={load} />

      <Card
        title="API keys"
        subtitle="Keys the gateway accepts. The CRM itself uses the key configured on the backend."
        actions={
          <button className="owa-icon-btn" onClick={load} disabled={loading} title="Refresh">
            {loading ? <Spinner size={14} /> : <RefreshCw size={14} />}
          </button>
        }
      >
        <div className="owa-form-grid">
          <Field label="Key name"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="integration-name" /></Field>
          <Field label="Role">
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="operator">Operator</option>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
        </div>
        <button className="owa-btn owa-btn-primary" style={{ marginTop: 12 }} onClick={create} disabled={saving || !name.trim()}>
          {saving ? <Spinner size={14} /> : <Plus size={14} />} Create key
        </button>

        {created?.apiKey && (
          <div style={{ marginTop: 14 }}>
            <div className="owa-key-reveal">
              <Key size={16} />
              <span>{created.apiKey}</span>
              <button className="owa-icon-btn" onClick={copyKey} title="Copy">
                <Copy size={13} />
              </button>
            </div>
            <p className="owa-small owa-muted" style={{ marginTop: 6 }}>
              {copied ? 'Copied. ' : ''}This is the only time the full key is shown — store it now.
            </p>
          </div>
        )}
      </Card>

      <Card title="Existing keys">
        {loading && keys.length === 0 ? (
          <div className="owa-empty"><Spinner size={20} /></div>
        ) : keys.length === 0 ? (
          <Empty icon={Key} title="No API keys" text="Create a key above for external integrations." />
        ) : (
          <div className="owa-table-wrap">
            <table className="owa-table">
              <thead><tr><th>Name</th><th>Prefix</th><th>Role</th><th>Status</th><th>Last used</th><th style={{ width: 120 }} /></tr></thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id}>
                    <td><strong>{key.name}</strong></td>
                    <td className="owa-mono">{key.keyPrefix || '—'}</td>
                    <td><Badge tone={key.role === 'admin' ? 'info' : 'neutral'}>{key.role}</Badge></td>
                    <td><Badge tone={key.isActive ? 'ok' : 'bad'}>{key.isActive ? 'Active' : 'Revoked'}</Badge></td>
                    <td className="owa-small owa-muted owa-nowrap">{fmtTime(key.lastUsedAt)}</td>
                    <td>
                      <div className="owa-row-actions">
                        {key.isActive && <button className="owa-btn owa-btn-sm" onClick={() => revoke(key)}>Revoke</button>}
                        <button className="owa-icon-btn danger" title="Delete" onClick={() => remove(key)}><Trash2 size={13} /></button>
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

/* ------------------------------------------------------------------ */
/* Audit logs                                                          */
/* ------------------------------------------------------------------ */

export function LogsSection() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [limit] = useState(100)
  const [offset, setOffset] = useState(0)
  const [severity, setSeverity] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const data = await gateway.listAudit({ limit, offset, severity })
      setRows(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [])
      setTotal(Number(data?.total) || 0)
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, severity])

  return (
    <div className="owa-page">
      <ErrorNote error={error} onRetry={load} />

      <Card
        title="Audit log"
        subtitle={`${fmtNumber(total)} recorded actions`}
        actions={
          <div className="owa-toolbar">
            <select value={severity} onChange={(event) => { setSeverity(event.target.value); setOffset(0) }} style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid var(--owa-border)', background: 'var(--owa-surface)', color: 'var(--owa-text)' }}>
              <option value="">All severities</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="error">Error</option>
            </select>
            <button className="owa-icon-btn" onClick={load} disabled={loading} title="Refresh">
              {loading ? <Spinner size={14} /> : <RefreshCw size={14} />}
            </button>
          </div>
        }
      >
        {loading && rows.length === 0 ? (
          <div className="owa-empty"><Spinner size={20} /></div>
        ) : rows.length === 0 ? (
          <Empty icon={Server} title="No audit entries" text="Actions performed through the gateway are recorded here." />
        ) : (
          <>
            <div className="owa-table-wrap">
              <table className="owa-table">
                <thead><tr><th>Time</th><th>Action</th><th>Severity</th><th>Session</th><th>HTTP</th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="owa-small owa-nowrap">{fmtTime(row.createdAt)}</td>
                      <td><strong className="owa-small">{row.action}</strong>{row.errorMessage && <div className="owa-small owa-muted">{row.errorMessage}</div>}</td>
                      <td><Badge tone={row.severity === 'error' ? 'bad' : row.severity === 'warn' ? 'warn' : 'neutral'}>{row.severity}</Badge></td>
                      <td className="owa-small">{row.sessionName || row.sessionId || '—'}</td>
                      <td className="owa-mono">{row.statusCode || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="owa-toolbar" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
              <button className="owa-btn owa-btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Previous</button>
              <span className="owa-small owa-muted">{offset + 1}–{Math.min(offset + rows.length, total)} of {fmtNumber(total)}</span>
              <button className="owa-btn owa-btn-sm" disabled={offset + rows.length >= total} onClick={() => setOffset(offset + limit)}>Next</button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ */
function ensureOk(result) {
  if (result && result.success === false) throw new Error(result.message || 'The gateway refused the change')
  return result
}

function pluginEnabled(plugin) {
  return plugin?.enabled ?? plugin?.isEnabled ?? plugin?.status === 'enabled'
}

function sessionLabel(plugin) {
  const active = Array.isArray(plugin?.activeSessions) ? plugin.activeSessions : []
  if (active.includes('*')) return 'All sessions'
  return `${active.length} session${active.length === 1 ? '' : 's'}`
}

export function PluginsSection() {
  const { sessions } = useSessions()
  const [plugins, setPlugins] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [manage, setManage] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [configText, setConfigText] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)
  const [allSessions, setAllSessions] = useState(true)
  const [scopedSessions, setScopedSessions] = useState([])
  const [savingScope, setSavingScope] = useState(false)
  const [perSessionId, setPerSessionId] = useState('')
  const [perSessionText, setPerSessionText] = useState('{}')
  const [savingPerSession, setSavingPerSession] = useState(false)
  const [health, setHealth] = useState(null)
  const [healthLoading, setHealthLoading] = useState(false)

  const [installOpen, setInstallOpen] = useState(false)
  const [installFile, setInstallFile] = useState(null)
  const [installUrl, setInstallUrl] = useState('')
  const [installing, setInstalling] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await gateway.listPlugins()
      setPlugins(Array.isArray(data) ? data : data?.plugins || [])
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const refreshDetail = async (id) => {
    const detail = await gateway.pluginDetail(id)
    setManage(detail)
    return detail
  }

  const openManage = async (plugin) => {
    setManage(plugin)
    setDetailLoading(true)
    setHealth(null)
    setPerSessionId('')
    setPerSessionText('{}')
    setNotice('')
    try {
      const detail = await refreshDetail(plugin.id)
      setConfigText(JSON.stringify(detail.config || {}, null, 2))
      setAllSessions((detail.activeSessions || []).includes('*'))
      setScopedSessions((detail.activeSessions || []).filter((id) => id !== '*'))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setDetailLoading(false)
    }
  }

  const toggle = async (plugin, enable) => {
    setError('')
    setNotice('')
    try {
      ensureOk(await (enable ? gateway.enablePlugin(plugin.id) : gateway.disablePlugin(plugin.id)))
      setNotice(enable ? 'Plugin enabled.' : 'Plugin disabled.')
      await load()
      if (manage?.id === plugin.id) await refreshDetail(plugin.id)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const saveConfig = async () => {
    let parsed
    try {
      parsed = JSON.parse(configText || '{}')
    } catch {
      setError('Configuration is not valid JSON.')
      return
    }
    setSavingConfig(true)
    setError('')
    setNotice('')
    try {
      ensureOk(await gateway.updatePluginConfig(manage.id, parsed))
      setNotice('Configuration saved.')
      await refreshDetail(manage.id)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSavingConfig(false)
    }
  }

  const saveScope = async () => {
    setSavingScope(true)
    setError('')
    setNotice('')
    try {
      ensureOk(await gateway.updatePluginSessions(manage.id, allSessions ? ['*'] : scopedSessions))
      setNotice('Session activation saved.')
      await refreshDetail(manage.id)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSavingScope(false)
    }
  }

  const pickPerSession = (sessionId) => {
    setPerSessionId(sessionId)
    setPerSessionText(JSON.stringify(manage?.sessionConfig?.[sessionId] || {}, null, 2))
  }

  const savePerSession = async () => {
    let parsed
    try {
      parsed = JSON.parse(perSessionText || '{}')
    } catch {
      setError('Session override is not valid JSON.')
      return
    }
    setSavingPerSession(true)
    setError('')
    setNotice('')
    try {
      ensureOk(await gateway.updatePluginSessionConfig(manage.id, perSessionId, parsed))
      setNotice('Session override saved.')
      await refreshDetail(manage.id)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSavingPerSession(false)
    }
  }

  const checkHealth = async () => {
    setHealthLoading(true)
    setHealth(null)
    try {
      setHealth(await gateway.pluginHealth(manage.id))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setHealthLoading(false)
    }
  }

  const updatePlugin = async (plugin) => {
    const url = window.prompt('Plugin .zip URL (https://… or http://… with #sha256=<digest>)')
    if (!url) return
    setError('')
    setNotice('')
    try {
      ensureOk(await gateway.updatePlugin(plugin.id, url.trim()))
      setNotice('Plugin updated.')
      await refreshDetail(plugin.id)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const removePlugin = async (plugin) => {
    if (!window.confirm(`Uninstall plugin "${plugin.name}"? This removes its files and configuration.`)) return
    setError('')
    setNotice('')
    try {
      await gateway.deletePlugin(plugin.id)
      setManage(null)
      setNotice('Plugin uninstalled.')
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const install = async () => {
    if (!installFile && !installUrl.trim()) {
      setError('Choose a .zip package or enter a URL.')
      return
    }
    setInstalling(true)
    setError('')
    setNotice('')
    try {
      if (installFile) await gateway.installPlugin(installFile)
      else await gateway.installPluginFromUrl(installUrl.trim())
      setInstallOpen(false)
      setInstallFile(null)
      setInstallUrl('')
      setNotice('Plugin installed.')
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setInstalling(false)
    }
  }

  const enabled = pluginEnabled(manage)

  return (
    <div className="owa-page">
      <ErrorNote error={error} onRetry={load} />
      {notice && (
        <div className="owa-error" style={{ borderColor: 'rgba(22,163,74,.3)', background: 'rgba(22,163,74,.08)', color: '#15803d' }}>
          {notice}
        </div>
      )}

      <Card
        title="Plugins"
        subtitle="Installed gateway plugins, configuration and session activation."
        actions={
          <>
            <button className="owa-icon-btn" onClick={load} disabled={loading} title="Refresh">
              {loading ? <Spinner size={14} /> : <RefreshCw size={14} />}
            </button>
            <button className="owa-btn owa-btn-primary" onClick={() => setInstallOpen(true)}>
              <Upload size={15} /> Install plugin
            </button>
          </>
        }
      >
        {loading && plugins.length === 0 ? (
          <div className="owa-empty"><Spinner size={20} /></div>
        ) : plugins.length === 0 ? (
          <Empty icon={Puzzle} title="No plugins installed" text="Install a plugin .zip package or from a URL." />
        ) : (
          <div className="owa-table-wrap">
            <table className="owa-table">
              <thead>
                <tr><th>Plugin</th><th>Version</th><th>Type</th><th>Sessions</th><th>Status</th><th style={{ width: 210 }} /></tr>
              </thead>
              <tbody>
                {plugins.map((plugin) => {
                  const active = pluginEnabled(plugin)
                  return (
                    <tr key={plugin.id}>
                      <td>
                        <div className="owa-cell-main">
                          <strong>{plugin.name || plugin.id}</strong>
                          <span>{plugin.description || plugin.id}</span>
                        </div>
                      </td>
                      <td className="owa-mono">{plugin.version || '—'}</td>
                      <td><Badge tone={plugin.builtIn ? 'info' : 'neutral'}>{plugin.builtIn ? 'Built-in' : plugin.type || 'plugin'}</Badge></td>
                      <td className="owa-small">{sessionLabel(plugin)}</td>
                      <td><Badge tone={active ? 'ok' : 'neutral'}>{active ? 'Enabled' : 'Disabled'}</Badge></td>
                      <td>
                        <div className="owa-row-actions">
                          <button className="owa-btn owa-btn-sm" onClick={() => openManage(plugin)}>Manage</button>
                          <button className="owa-btn owa-btn-sm" onClick={() => toggle(plugin, !active)}>
                            {active ? 'Disable' : 'Enable'}
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

      {manage && (
        <Modal
          wide
          title={manage.name || manage.id}
          subtitle={`${manage.id} · v${manage.version || '—'}${manage.author ? ` · ${manage.author}` : ''}`}
          onClose={() => setManage(null)}
          footer={<button className="owa-btn" onClick={() => setManage(null)}>Close</button>}
        >
          {detailLoading ? (
            <div className="owa-empty"><Spinner size={22} /></div>
          ) : (
            <>
              <div className="owa-toolbar">
                <Badge tone={enabled ? 'ok' : 'neutral'}>{enabled ? 'Enabled' : 'Disabled'}</Badge>
                {manage.builtIn && <Badge tone="info">Built-in</Badge>}
                <button className="owa-btn owa-btn-sm" onClick={checkHealth} disabled={healthLoading}>
                  {healthLoading ? <Spinner size={12} /> : null} Health check
                </button>
                {health && (
                  <Badge tone={health.healthy ? 'ok' : 'bad'}>
                    {health.healthy ? 'Healthy' : health.message || 'Unhealthy'}
                  </Badge>
                )}
                <button className="owa-btn owa-btn-sm" onClick={() => toggle(manage, !enabled)}>
                  {enabled ? 'Disable' : 'Enable'}
                </button>
                {!manage.builtIn && (
                  <button className="owa-btn owa-btn-sm" onClick={() => updatePlugin(manage)}>Update from URL</button>
                )}
                {!manage.builtIn && (
                  <button className="owa-btn owa-btn-sm owa-btn-danger" onClick={() => removePlugin(manage)}>
                    <Trash2 size={12} /> Uninstall
                  </button>
                )}
              </div>

              <p className="owa-small owa-muted">{manage.description || 'No description provided.'}</p>

              <Field label="Configuration (JSON)" hint="Secrets are redacted by the gateway; saving restores them.">
                <textarea
                  className="owa-config-area"
                  value={configText}
                  onChange={(event) => setConfigText(event.target.value)}
                  spellCheck={false}
                />
              </Field>
              <div className="owa-toolbar" style={{ justifyContent: 'flex-end' }}>
                <button className="owa-btn owa-btn-primary" onClick={saveConfig} disabled={savingConfig}>
                  {savingConfig ? <Spinner size={14} /> : <Save size={14} />} Save configuration
                </button>
              </div>

              {manage.sessionScoped && (
                <>
                  <hr style={{ border: 0, borderTop: '1px solid var(--owa-border)', margin: '6px 0' }} />
                  <h3 style={{ fontSize: 14, fontWeight: 700 }}>Session activation</h3>
                  <label className="owa-check">
                    <input type="checkbox" checked={allSessions} onChange={(event) => setAllSessions(event.target.checked)} />
                    All sessions
                  </label>
                  {!allSessions && (
                    <div className="owa-list" style={{ maxHeight: 160, overflow: 'auto' }}>
                      {sessions.length === 0 ? (
                        <p className="owa-small owa-muted">No sessions available.</p>
                      ) : (
                        sessions.map((session) => (
                          <label key={session.id} className="owa-check" style={{ padding: '4px 0' }}>
                            <input
                              type="checkbox"
                              checked={scopedSessions.includes(session.id)}
                              onChange={(event) =>
                                setScopedSessions((current) =>
                                  event.target.checked
                                    ? [...current, session.id]
                                    : current.filter((id) => id !== session.id),
                                )
                              }
                            />
                            {session.name} <span className="owa-mono owa-small">{session.id}</span>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                  <div className="owa-toolbar" style={{ justifyContent: 'flex-end' }}>
                    <button className="owa-btn" onClick={saveScope} disabled={savingScope}>
                      {savingScope ? <Spinner size={14} /> : <Save size={14} />} Save activation
                    </button>
                  </div>

                  <h3 style={{ fontSize: 14, fontWeight: 700 }}>Per-session override</h3>
                  <Field label="Session">
                    <select value={perSessionId} onChange={(event) => pickPerSession(event.target.value)}>
                      <option value="">Select a session</option>
                      {sessions.map((session) => (
                        <option key={session.id} value={session.id}>{session.name}</option>
                      ))}
                    </select>
                  </Field>
                  {perSessionId && (
                    <>
                      <Field label="Override (JSON)" hint="Merged over the global configuration for this session.">
                        <textarea
                          className="owa-config-area"
                          value={perSessionText}
                          onChange={(event) => setPerSessionText(event.target.value)}
                          spellCheck={false}
                        />
                      </Field>
                      <div className="owa-toolbar" style={{ justifyContent: 'flex-end' }}>
                        <button className="owa-btn" onClick={savePerSession} disabled={savingPerSession}>
                          {savingPerSession ? <Spinner size={14} /> : <Save size={14} />} Save override
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}

              {manage.configSchema && (
                <details>
                  <summary className="owa-small owa-muted" style={{ cursor: 'pointer' }}>Config schema</summary>
                  <pre className="owa-code" style={{ marginTop: 8 }}>{JSON.stringify(manage.configSchema, null, 2)}</pre>
                </details>
              )}
            </>
          )}
        </Modal>
      )}

      {installOpen && (
        <Modal
          title="Install plugin"
          subtitle="Upload a plugin .zip package, or install it from a URL."
          onClose={() => setInstallOpen(false)}
          footer={
            <>
              <button className="owa-btn" onClick={() => setInstallOpen(false)}>Cancel</button>
              <button className="owa-btn owa-btn-primary" onClick={install} disabled={installing}>
                {installing ? <Spinner size={14} /> : <Upload size={14} />} Install
              </button>
            </>
          }
        >
          <Field label="Plugin package (.zip)">
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={(event) => {
                setInstallFile(event.target.files?.[0] || null)
                event.target.value = ''
              }}
            />
          </Field>
          <Field label="…or install from URL" hint="The gateway requires an https URL (or http with a #sha256 digest).">
            <input value={installUrl} onChange={(event) => setInstallUrl(event.target.value)} placeholder="https://example.com/plugin.zip" />
          </Field>
          <p className="owa-small owa-muted">An uploaded file wins when both are provided.</p>
        </Modal>
      )}
    </div>
  )
}


/* Infrastructure                                                      */
/* ------------------------------------------------------------------ */

export function InfrastructureSection() {
  const [status, setStatus] = useState(null)
  const [health, setHealth] = useState(null)
  const [ready, setReady] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [statusData, healthData, readyData] = await Promise.allSettled([
        gateway.infraStatus(),
        gateway.health(),
        gateway.healthReady(),
      ])
      setStatus(statusData.status === 'fulfilled' ? statusData.value : null)
      setHealth(healthData.status === 'fulfilled' ? healthData.value : null)
      setReady(readyData.status === 'fulfilled' ? readyData.value : null)
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const healthy = health?.status === 'ok' || health?.status === 'healthy'

  return (
    <div className="owa-page">
      <ErrorNote error={error} onRetry={load} />

      <div className="owa-stats">
        <div className="owa-stat">
          <span className="owa-stat-label">Health</span>
          <strong className="owa-stat-value" style={{ color: healthy ? 'var(--owa-ok)' : 'var(--owa-warn)' }}>
            {health?.status || 'Unknown'}
          </strong>
          <span className="owa-stat-hint">{health?.version ? `v${health.version}` : 'Gateway API'}</span>
        </div>
        <div className="owa-stat">
          <span className="owa-stat-label">Readiness</span>
          <strong className="owa-stat-value" style={{ color: ready?.status === 'ok' ? 'var(--owa-ok)' : 'var(--owa-warn)' }}>
            {ready?.status || 'Unknown'}
          </strong>
          <span className="owa-stat-hint">Dependencies check</span>
        </div>
      </div>

      <Card title="Infrastructure status" actions={<button className="owa-icon-btn" onClick={load} disabled={loading} title="Refresh">{loading ? <Spinner size={14} /> : <RefreshCw size={14} />}</button>}>
        {loading && !status ? (
          <div className="owa-empty"><Spinner size={20} /></div>
        ) : (
          <pre className="owa-code">{JSON.stringify(status || health || { message: 'No data' }, null, 2)}</pre>
        )}
      </Card>
    </div>
  )
}
