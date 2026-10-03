import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { api } from '../../api/auth'

// A monthly FRO idle report read from the server-authoritative time ledger.
// Shared by the super-admin page and the NGO-admin dashboard; the backend scopes
// the rows to the caller's NGOs, so both audiences use the same endpoints.
const CSS = `
.fir-page { width: 100%; min-width: 0; }
.fir-title { margin: 0; font-size: 27px; font-weight: 700; color: #10213D; line-height: 1.2; }
.fir-title-sm { font-size: 18px; }
.fir-sub { margin-top: 2px; font-size: 13px; color: #6D7E95; }
.fir-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
.fir-input, .fir-select { height: 38px; border-radius: 9px; border: 1px solid #DCE7F5; background: #fff; color: #10213D; font-size: 13px; font-family: inherit; outline: none; padding: 0 12px; min-width: 0; }
.fir-input:focus, .fir-select:focus { border-color: #2F7DF4; }
.fir-input { flex: 1 1 220px; }
.fir-select { flex: 0 1 auto; cursor: pointer; }
.fir-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 14px; }
.fir-sum { background: #fff; border: 1px solid #DCE7F5; border-radius: 11px; box-shadow: 0 2px 8px rgba(35,76,120,.05); padding: 12px 14px; min-width: 0; }
.fir-sum-val { font-size: 22px; font-weight: 700; color: #10213D; line-height: 1.1; font-variant-numeric: tabular-nums; }
.fir-sum-lbl { font-size: 12px; color: #6D7E95; font-weight: 600; margin-top: 2px; }
.fir-card { background: #fff; border: 1px solid #DCE7F5; border-radius: 12px; box-shadow: 0 2px 8px rgba(35,76,120,.04); margin-top: 12px; overflow: hidden; }
.fir-table { width: 100%; border-collapse: collapse; }
.fir-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #6D7E95; font-weight: 700; padding: 11px 14px; border-bottom: 1px solid #E7EFF9; background: #F9FBFE; }
.fir-table td { font-size: 13px; color: #10213D; padding: 11px 14px; border-bottom: 1px solid #F0F5FB; font-variant-numeric: tabular-nums; }
.fir-table tbody tr { cursor: pointer; }
.fir-table tbody tr:hover { background: #F6F9FD; }
.fir-table tbody tr.is-open { background: #EFF6FF; }
.fir-name { font-weight: 700; }
.fir-login { font-size: 12px; color: #6D7E95; }
.fir-num { text-align: right; }
.fir-bar { height: 8px; border-radius: 999px; background: #FEE4E2; overflow: hidden; min-width: 60px; }
.fir-bar > span { display: block; height: 100%; background: #D92D20; }
.fir-drill { border-top: 1px solid #E7EFF9; background: #FBFDFF; padding: 14px; }
.fir-drill-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.fir-drill-title { font-size: 14px; font-weight: 700; color: #10213D; }
.fir-days { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
.fir-day { background: #fff; border: 1px solid #E7EFF9; border-radius: 9px; padding: 9px 11px; }
.fir-day-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.fir-day-date { font-size: 12px; font-weight: 700; color: #10213D; }
.fir-day-idle { font-size: 13px; font-weight: 700; color: #D92D20; font-variant-numeric: tabular-nums; }
.fir-day-meta { font-size: 11px; color: #6D7E95; margin-top: 3px; }
.fir-sessions { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.fir-session { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: #475569; background: #F6F9FD; border-radius: 6px; padding: 4px 7px; }
.fir-session b { color: #10213D; font-weight: 700; }
.fir-tag { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 999px; background: #EFF6FF; color: #287FE8; }
.fir-state { background: #fff; border: 1px solid #DCE7F5; border-radius: 12px; padding: 44px 20px; text-align: center; margin-top: 12px; color: #6D7E95; font-size: 13px; }
.fir-link { border: none; background: none; color: #287FE8; font-weight: 700; font-size: 11px; cursor: pointer; font-family: inherit; padding: 0; }
@media (max-width: 900px) { .fir-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`

const STATE_LABEL = { IDLE: 'Idle', SLEEPING: 'Sleeping', HIDDEN: 'Tab away' }

export function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}m`
}

function thisMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthBounds(month) {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

function fmtClock(iso) {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch { return '—' }
}

export default function FroIdleReportPanel({ title = 'FRO Idle Report', subtitle = 'Idle time from the server-authoritative time ledger, split by IST day.', compact = false }) {
  const [month, setMonth] = useState(thisMonth)
  const [ngoId, setNgoId] = useState('all')
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [openId, setOpenId] = useState(null)
  const [drill, setDrill] = useState({ loading: false, error: null, data: null })
  const [sessions, setSessions] = useState({})
  const aliveRef = useRef(true)

  const { from, to } = useMemo(() => monthBounds(month), [month])

  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api(`/fro/reports/idle?from=${from}&to=${to}`, { _prefix: 'ucs' })
      .then((data) => { if (!cancelled) setRows(Array.isArray(data?.fros) ? data.fros : []) })
      .catch((err) => { if (!cancelled) { setRows([]); setError(err.message || 'Failed to load idle report') } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [from, to])

  const ngos = useMemo(() => {
    const map = new Map()
    for (const r of rows) if (r.ngo_id && !map.has(String(r.ngo_id))) map.set(String(r.ngo_id), r.ngo_id)
    return [...map.entries()]
  }, [rows])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (ngoId !== 'all' && String(r.ngo_id) !== String(ngoId)) return false
      if (q && !`${r.name} ${r.login_id}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, ngoId, query])

  const maxIdle = useMemo(() => visible.reduce((m, r) => Math.max(m, r.total_idle_seconds || 0), 0), [visible])
  const totals = useMemo(() => {
    const total = visible.reduce((a, r) => a + (r.total_idle_seconds || 0), 0)
    return {
      total,
      count: visible.length,
      avg: visible.length ? Math.round(total / visible.length) : 0,
      flagged: visible.filter((r) => r.total_idle_seconds > 0).length,
    }
  }, [visible])

  const toggleRow = async (r) => {
    const id = String(r.worker_id)
    if (openId === id) { setOpenId(null); return }
    setOpenId(id)
    setDrill({ loading: true, error: null, data: null })
    setSessions({})
    try {
      const data = await api(`/fro/reports/idle?worker_id=${id}&from=${from}&to=${to}`, { _prefix: 'ucs' })
      if (aliveRef.current) setDrill({ loading: false, error: null, data })
    } catch (err) {
      if (aliveRef.current) setDrill({ loading: false, error: err.message || 'Failed to load days', data: null })
    }
  }

  const loadSessions = async (workerId, date) => {
    const key = `${workerId}:${date}`
    setSessions((s) => ({ ...s, [key]: { loading: true, data: null, error: null } }))
    try {
      const data = await api(`/fro/reports/idle/sessions?worker_id=${workerId}&date=${date}`, { _prefix: 'ucs' })
      if (aliveRef.current) setSessions((s) => ({ ...s, [key]: { loading: false, data, error: null } }))
    } catch (err) {
      if (aliveRef.current) setSessions((s) => ({ ...s, [key]: { loading: false, data: null, error: err.message } }))
    }
  }

  return (
    <div className="fir-page">
      <style>{CSS}</style>
      <div className={compact ? 'fir-title fir-title-sm' : 'fir-title'}>{title}</div>
      <div className="fir-sub">{subtitle}</div>

      <div className="fir-toolbar">
        <input className="fir-input" type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value || thisMonth())} aria-label="Month" />
        <select className="fir-select" value={ngoId} onChange={(e) => setNgoId(e.target.value)} aria-label="NGO">
          <option value="all">All NGOs</option>
          {ngos.map(([id]) => <option key={id} value={id}>{String(id).slice(0, 8)}…</option>)}
        </select>
        <input className="fir-input" placeholder="Search FRO name or login…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="fir-summary">
        <div className="fir-sum"><div className="fir-sum-val">{fmtDuration(totals.total)}</div><div className="fir-sum-lbl">Total idle this month</div></div>
        <div className="fir-sum"><div className="fir-sum-val">{totals.count}</div><div className="fir-sum-lbl">FROs in view</div></div>
        <div className="fir-sum"><div className="fir-sum-val">{fmtDuration(totals.avg)}</div><div className="fir-sum-lbl">Average per FRO</div></div>
        <div className="fir-sum"><div className="fir-sum-val">{totals.flagged}</div><div className="fir-sum-lbl">FROs with idle</div></div>
      </div>

      <div className="fir-card">
        {loading ? (
          <div className="fir-state">Loading idle report…</div>
        ) : error ? (
          <div className="fir-state">{error}</div>
        ) : visible.length === 0 ? (
          <div className="fir-state">No FRO idle recorded for this period.</div>
        ) : (
          <table className="fir-table">
            <thead>
              <tr>
                <th>FRO</th>
                <th>NGO</th>
                <th className="fir-num">Idle</th>
                <th style={{ width: 160 }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const id = String(r.worker_id)
                const pct = maxIdle ? Math.round(((r.total_idle_seconds || 0) / maxIdle) * 100) : 0
                const isOpen = openId === id
                return (
                  <Fragment key={id}>
                    <tr className={isOpen ? 'is-open' : ''} onClick={() => toggleRow(r)}>
                      <td>
                        <div className="fir-name">{r.name}</div>
                        {r.login_id ? <div className="fir-login">{r.login_id}</div> : null}
                      </td>
                      <td>{r.ngo_id ? String(r.ngo_id).slice(0, 8) : '—'}</td>
                      <td className="fir-num" style={{ color: r.total_idle_seconds > 0 ? '#D92D20' : '#6D7E95', fontWeight: 700 }}>{fmtDuration(r.total_idle_seconds || 0)}</td>
                      <td><div className="fir-bar"><span style={{ width: `${pct}%` }} /></div></td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={4} style={{ padding: 0 }}>
                          <div className="fir-drill">
                            <div className="fir-drill-head">
                              <div className="fir-drill-title">{r.name} — daily idle, {from} to {to}</div>
                            </div>
                            {drill.loading ? <div className="fir-day-meta">Loading days…</div>
                              : drill.error ? <div className="fir-day-meta" style={{ color: '#D92D20' }}>{drill.error}</div>
                              : (
                                <div className="fir-days">
                                  {(drill.data?.daily || []).filter((d) => d.idle_seconds > 0).map((d) => {
                                    const key = `${id}:${d.date}`
                                    const s = sessions[key]
                                    return (
                                      <div className="fir-day" key={d.date}>
                                        <div className="fir-day-top">
                                          <span className="fir-day-date">{d.date}</span>
                                          <span className="fir-day-idle">{fmtDuration(d.idle_seconds)}</span>
                                        </div>
                                        <div className="fir-day-meta">
                                          Worked {fmtDuration(d.worked_seconds)} · Meeting {fmtDuration(d.meeting_seconds)} · Internet {fmtDuration(d.internet_problem_seconds)}
                                        </div>
                                        <button className="fir-link" onClick={() => loadSessions(id, d.date)}>
                                          {s?.loading ? 'Loading…' : s?.data ? 'Hide sessions' : 'View sessions'}
                                        </button>
                                        {s?.data && (
                                          <div className="fir-sessions">
                                            {(s.data.sessions || []).map((x, i) => (
                                              <div className="fir-session" key={i}>
                                                <span>
                                                  <b>{fmtClock(x.started_at)}</b> – {x.open ? 'now' : fmtClock(x.ended_at)}
                                                  {' '}<span className="fir-tag">{STATE_LABEL[x.state] || x.state}</span>
                                                </span>
                                                <b>{fmtDuration(x.duration_seconds)}</b>
                                              </div>
                                            ))}
                                            {(s.data.sessions || []).length === 0 ? <div className="fir-day-meta">No sessions.</div> : null}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                  {(drill.data?.daily || []).every((d) => d.idle_seconds === 0) ? <div className="fir-day-meta">No idle this period.</div> : null}
                                </div>
                              )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
