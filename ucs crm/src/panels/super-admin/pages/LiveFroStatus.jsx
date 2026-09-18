import { useState, useEffect, useMemo, useRef } from 'react'
import { api } from '../../../api/auth'
import { onDbChange } from '../../../lib/socket'
import { fmt } from '../components/froShared'
import { FroDetailModal, FroDeepDetailModal } from '../components/FroModals'

const LFS_CSS = `
.lfs-page { width: 100%; min-width: 0; }
.lfs-crumb { font-size: 11px; color: #6D7E95; margin-bottom: 2px; }
.lfs-title { margin: 0; font-size: 27px; font-weight: 700; color: #10213D; line-height: 1.2; }
.lfs-sub { margin-top: 2px; font-size: 13px; color: #6D7E95; }
.lfs-head-actions { display: flex; align-items: center; gap: 8; flex-wrap: wrap; }
.lfs-btn { display: inline-flex; align-items: center; gap: 6; height: 38px; padding: 0 14px; border-radius: 9px; border: 1px solid #DCE7F5; background: #fff; color: #10213D; font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer; white-space: nowrap; }
.lfs-btn:hover { background: #F6F9FD; }
.lfs-btn:focus-visible { outline: 2px solid #2F7DF4; outline-offset: 2px; }
.lfs-btn-danger { background: #E52B4A; border-color: #E52B4A; color: #fff; }
.lfs-btn-danger:hover { background: #c81f3c; }
.lfs-btn:disabled { opacity: .6; cursor: wait; }
.lfs-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 14px; }
.lfs-sum { background: #fff; border: 1px solid #DCE7F5; border-radius: 11px; box-shadow: 0 2px 8px rgba(35,76,120,.05); padding: 12px 14px; min-width: 0; min-height: 78px; display: flex; align-items: center; gap: 12px; }
.lfs-sum-ico { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.lfs-sum-val { font-size: 22px; font-weight: 700; color: #10213D; line-height: 1.1; font-variant-numeric: tabular-nums; }
.lfs-sum-lbl { font-size: 12px; color: #6D7E95; font-weight: 600; }
.lfs-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
.lfs-input, .lfs-select { height: 38px; border-radius: 9px; border: 1px solid #DCE7F5; background: #fff; color: #10213D; font-size: 13px; font-family: inherit; outline: none; padding: 0 12px; min-width: 0; }
.lfs-input:focus, .lfs-select:focus { border-color: #2F7DF4; }
.lfs-input { flex: 1 1 220px; }
.lfs-select { flex: 0 1 auto; cursor: pointer; }
.lfs-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
.lfs-grid > * { min-width: 0; }
.lfs-card { background: #fff; border: 1px solid #DCE7F5; border-radius: 12px; padding: 12px; box-shadow: 0 2px 8px rgba(35,76,120,.04); min-width: 0; }
.lfs-card-top { display: flex; align-items: center; gap: 10px; min-width: 0; }
.lfs-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; background: #EFF6FF; color: #287FE8; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; overflow: hidden; }
.lfs-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; max-width: 100%; }
.lfs-id { flex: 1 1 auto; min-width: 0; }
.lfs-name { font-size: 15px; font-weight: 700; color: #10213D; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lfs-mail { font-size: 12px; color: #6D7E95; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lfs-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; white-space: nowrap; flex-shrink: 0; }
.lfs-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.lfs-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; margin-top: 10px; }
.lfs-metric { background: #F6F9FD; border-radius: 7px; padding: 7px 4px; text-align: center; min-width: 0; }
.lfs-metric-val { font-size: 13px; font-weight: 700; color: #10213D; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lfs-metric-lbl { font-size: 10px; color: #6D7E95; font-weight: 600; margin-top: 1px; }
.lfs-seen { font-size: 11px; color: #6D7E95; margin-top: 8px; }
.lfs-skel { background: #fff; border: 1px solid #DCE7F5; border-radius: 12px; padding: 12px; min-width: 0; }
.lfs-shimmer { border-radius: 8px; background: linear-gradient(90deg, #EDF2F9 25%, #F7FAFE 50%, #EDF2F9 75%); background-size: 200% 100%; animation: lfs-sh 1.2s ease-in-out infinite; }
@keyframes lfs-sh { to { background-position: -200% 0; } }
.lfs-state { background: #fff; border: 1px solid #DCE7F5; border-radius: 12px; padding: 44px 20px; text-align: center; margin-top: 12px; }
@media (max-width: 1100px) {
  .lfs-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 900px) {
  .lfs-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 767px) {
  .lfs-grid { grid-template-columns: minmax(0, 1fr); }
  .lfs-input { flex: 1 1 100%; }
}
`

const PILL = {
  online: { label: 'Online', color: '#12A65A', bg: '#EAF9F0' },
  idle: { label: 'Idle', color: '#E98A00', bg: '#FFF7EA' },
  on_call: { label: 'Talking', color: '#287FE8', bg: '#EFF6FF' },
  break: { label: 'Break', color: '#E98A00', bg: '#FFF7EA' },
  offline: { label: 'Offline', color: '#6D7E95', bg: '#F1F5F9' },
}

const FILTERS = [
  { value: 'all', label: 'All Status' },
  { value: 'online', label: 'Online' },
  { value: 'idle', label: 'Idle' },
  { value: 'on_call', label: 'Talking' },
  { value: 'break', label: 'On Break' },
  { value: 'offline', label: 'Offline' },
]

const SORTS = [
  { value: 'name-asc', label: 'Sort by Name (A-Z)' },
  { value: 'name-desc', label: 'Sort by Name (Z-A)' },
  { value: 'idle-desc', label: 'Sort by Idle (High First)' },
  { value: 'calls-desc', label: 'Sort by Calls (High First)' },
]

const initialsOf = (name) => String(name || 'F').split(' ').slice(0, 2).map((s) => s[0]).join('').toUpperCase()

function Avatar({ fs, name }) {
  const [err, setErr] = useState(false)
  const url = fs?.worker?.photo_url || fs?.photo_url || null
  useEffect(() => { setErr(false) }, [url])
  if (url && !err) {
    return (
      <span className="lfs-avatar" aria-hidden="true">
        <img src={url} alt="" onError={() => setErr(true)} />
      </span>
    )
  }
  return <span className="lfs-avatar" aria-hidden="true">{initialsOf(name)}</span>
}

export default function LiveFroStatus() {
  const [statuses, setStatuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [selectedFro, setSelectedFro] = useState(null)
  const [deepFro, setDeepFro] = useState(null)
  const [resetting, setResetting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sort, setSort] = useState('name-asc')
  const [now, setNow] = useState(() => Date.now())
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])

  const loadStatuses = async (showSpinner) => {
    if (showSpinner && aliveRef.current) setRefreshing(true)
    try {
      const data = await api('/fro/status', { _prefix: 'ucs' })
      if (!aliveRef.current) return
      setStatuses(Array.isArray(data) ? data : [])
      setLoadError(null)
    } catch (e) {
      if (!aliveRef.current) return
      setLoadError(e?.message || 'Failed to load')
    } finally {
      if (aliveRef.current) { setLoading(false); setRefreshing(false) }
    }
  }

  useEffect(() => { loadStatuses(false) }, [])

  useEffect(() => {
    return onDbChange({
      table: 'fro_live_status',
      event: '*',
      onInsert: () => loadStatuses(false),
      onUpdate: () => loadStatuses(false),
      onDelete: () => loadStatuses(false),
    })
  }, [])

  // One shared ticker for call/break durations — no per-card intervals.
  useEffect(() => {
    const t = setInterval(() => { if (aliveRef.current) setNow(Date.now()) }, 30000)
    return () => clearInterval(t)
  }, [])

  const refresh = () => { loadStatuses(true) }

  const resetAllIdle = async () => {
    if (!window.confirm("Clear today's idle time for ALL FROs? This resets every FRO's current idle counter to zero.")) return
    setResetting(true)
    try {
      await api('/fro/status/reset-idle', { method: 'PUT', body: JSON.stringify({}), _prefix: 'ucs' })
      await loadStatuses(false)
    } catch (e) {
      console.error('Error:', e.message)
    } finally {
      if (aliveRef.current) setResetting(false)
    }
  }

  const summary = useMemo(() => {
    let online = 0, idle = 0, talking = 0, talk = 0, idleSecs = 0
    for (const s of statuses) {
      if (s.status === 'online') online++
      else if (s.status === 'idle') idle++
      else if (s.status === 'on_call') talking++
      talk += Number(s.performance?.today_talk_seconds) || 0
      idleSecs += Number(s.performance?.today_idle_seconds) || 0
    }
    const denom = talk + idleSecs
    return { online, idle, talking, productivity: denom > 0 ? Math.round((talk / denom) * 100) : null }
  }, [statuses])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out = statuses.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false
      if (!q) return true
      const name = (s.worker?.name || '').toLowerCase()
      const mail = (s.worker?.email || s.worker?.login_id || '').toLowerCase()
      return name.includes(q) || mail.includes(q)
    })
    const byName = (a, b) => (a.worker?.name || '').localeCompare(b.worker?.name || '')
    const idleOf = (s) => Number(s.performance?.today_idle_seconds) || 0
    const callsOf = (s) => Number(s.performance?.today_calls) || 0
    if (sort === 'name-desc') out.sort((a, b) => byName(b, a))
    else if (sort === 'idle-desc') out.sort((a, b) => idleOf(b) - idleOf(a) || byName(a, b))
    else if (sort === 'calls-desc') out.sort((a, b) => callsOf(b) - callsOf(a) || byName(a, b))
    else out.sort(byName)
    return out
  }, [statuses, query, statusFilter, sort])

  const liveCallSecs = (fs) => {
    if (fs.computed?.call_duration_seconds != null) return fs.computed.call_duration_seconds
    if (fs.call_started_at) return Math.max(0, Math.floor((now - new Date(fs.call_started_at).getTime()) / 1000))
    return 0
  }
  const liveBreakSecs = (fs) => {
    if (fs.computed?.break_duration_seconds != null) return fs.computed.break_duration_seconds
    if (fs.break_started_at) return Math.max(0, Math.floor((now - new Date(fs.break_started_at).getTime()) / 1000))
    return 0
  }

  const sumCards = [
    { key: 'online', label: 'Online', value: summary.online, color: '#12A65A', bg: '#EAF9F0', icon: '●' },
    { key: 'idle', label: 'Idle', value: summary.idle, color: '#E98A00', bg: '#FFF7EA', icon: '●' },
    { key: 'talking', label: 'Talking', value: summary.talking, color: '#287FE8', bg: '#EFF6FF', icon: '●' },
    { key: 'prod', label: 'Productivity', value: summary.productivity == null ? '—' : `${summary.productivity}%`, color: '#E52B4A', bg: '#FFF1F4', icon: '%' },
  ]

  return (
    <div className="lfs-page">
      <style>{LFS_CSS}</style>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div className="lfs-crumb">Operations › Live FRO Status</div>
          <h1 className="lfs-title">Live FRO Status</h1>
          <div className="lfs-sub">Monitor your field team in real-time.</div>
        </div>
        <div className="lfs-head-actions">
          <button type="button" className="lfs-btn" onClick={refresh} disabled={refreshing} aria-label="Refresh FRO status">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className="lfs-btn lfs-btn-danger" onClick={resetAllIdle} disabled={resetting}>
            {resetting ? 'Clearing…' : 'Clear Idle Time'}
          </button>
        </div>
      </div>

      <div className="lfs-summary" role="status" aria-label="Team summary">
        {loading ? sumCards.map((c) => (
          <div key={c.key} className="lfs-sum" aria-hidden="true">
            <div className="lfs-shimmer" style={{ width: 38, height: 38, borderRadius: 10 }} />
            <div style={{ flex: 1 }}>
              <div className="lfs-shimmer" style={{ height: 22, width: '40%', marginBottom: 6 }} />
              <div className="lfs-shimmer" style={{ height: 12, width: '70%' }} />
            </div>
          </div>
        )) : sumCards.map((c) => (
          <div key={c.key} className="lfs-sum">
            <span className="lfs-sum-ico" style={{ background: c.bg, color: c.color, fontSize: 16, fontWeight: 800 }} aria-hidden="true">{c.icon}</span>
            <div style={{ minWidth: 0 }}>
              <div className="lfs-sum-val">{c.value}</div>
              <div className="lfs-sum-lbl">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="lfs-toolbar">
        <input
          type="text"
          className="lfs-input"
          placeholder="Search FRO..."
          aria-label="Search FRO by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="lfs-select" aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <select className="lfs-select" aria-label="Sort FROs" value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button type="button" className="lfs-btn" onClick={refresh} disabled={refreshing} aria-label="Refresh list">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="lfs-grid" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="lfs-skel">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className="lfs-shimmer" style={{ width: 40, height: 40, borderRadius: '50%' }} />
                <div style={{ flex: 1 }}>
                  <div className="lfs-shimmer" style={{ height: 14, width: '60%', marginBottom: 6 }} />
                  <div className="lfs-shimmer" style={{ height: 11, width: '80%' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 4, marginTop: 10 }}>
                {[0, 1, 2, 3].map((j) => <div key={j} className="lfs-shimmer" style={{ height: 44 }} />)}
              </div>
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="lfs-state" role="alert">
          <div style={{ fontSize: 15, fontWeight: 700, color: '#10213D' }}>Unable to load FRO status</div>
          <div style={{ fontSize: 13, color: '#6D7E95', marginTop: 4 }}>Please try again.</div>
          <button type="button" className="lfs-btn" style={{ marginTop: 12 }} onClick={refresh}>Retry</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="lfs-state">
          <div style={{ fontSize: 15, fontWeight: 700, color: '#10213D' }}>No FROs found</div>
          <div style={{ fontSize: 13, color: '#6D7E95', marginTop: 4 }}>Try changing your search or status filter.</div>
          {(query || statusFilter !== 'all') && (
            <button type="button" className="lfs-btn" style={{ marginTop: 12 }} onClick={() => { setQuery(''); setStatusFilter('all') }}>Clear Filters</button>
          )}
        </div>
      ) : (
        <div className="lfs-grid">
          {rows.map((fs) => {
            const meta = PILL[fs.status] || PILL.offline
            const name = fs.worker?.name || 'Unknown'
            const mail = fs.worker?.email || fs.worker?.login_id || ''
            const talk = Number(fs.performance?.today_talk_seconds) || 0
            const idleS = Number(fs.performance?.today_idle_seconds) || 0
            const calls = Number(fs.performance?.today_calls) || 0
            const denom = talk + idleS
            const prod = denom > 0 ? `${Math.round((talk / denom) * 100)}%` : '—'
            return (
              <article key={fs.id} className="lfs-card" aria-label={`${name}, ${meta.label}`}>
                <div className="lfs-card-top">
                  <Avatar fs={fs} name={name} />
                  <div className="lfs-id">
                    <div className="lfs-name" title={name}>{name}</div>
                    {!!mail && <div className="lfs-mail" title={mail}>{mail}</div>}
                  </div>
                  <span className="lfs-pill" style={{ background: meta.bg, color: meta.color }}>
                    <span className="lfs-dot" style={{ background: meta.color }} aria-hidden="true" />
                    {meta.label}
                  </span>
                </div>
                <div className="lfs-metrics">
                  <div className="lfs-metric">
                    <div className="lfs-metric-val" style={{ color: '#287FE8' }}>{fmt(fs.status === 'on_call' ? liveCallSecs(fs) : talk)}</div>
                    <div className="lfs-metric-lbl">Talk</div>
                  </div>
                  <div className="lfs-metric">
                    <div className="lfs-metric-val" style={{ color: '#10213D' }}>{calls}</div>
                    <div className="lfs-metric-lbl">Calls</div>
                  </div>
                  <div className="lfs-metric">
                    <div className="lfs-metric-val" style={{ color: '#E98A00' }}>{fmt(idleS)}</div>
                    <div className="lfs-metric-lbl">Idle</div>
                  </div>
                  <div className="lfs-metric">
                    <div className="lfs-metric-val" style={{ color: '#E52B4A' }}>{prod}</div>
                    <div className="lfs-metric-lbl">Productivity</div>
                  </div>
                </div>
                <div className="lfs-seen">Last seen: {fs.updated_at ? new Date(fs.updated_at).toLocaleTimeString('en-IN') : '—'}</div>
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button type="button" className="lfs-btn" style={{ height: 32, fontSize: 12, padding: '0 12px' }} onClick={() => setSelectedFro(fs)}>
                    View Details
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {selectedFro && <FroDetailModal fro={selectedFro} onClose={() => setSelectedFro(null)} onShowDeep={() => setDeepFro(selectedFro)} />}
      {deepFro && <FroDeepDetailModal fro={deepFro} onClose={() => setDeepFro(null)} />}
    </div>
  )
}
