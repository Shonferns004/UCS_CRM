import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { api } from '../../../api/auth'
import { formatDuration } from '../../../utils/formatDuration'

// The FRO's own idle history, read from the server-authoritative time ledger.
// Self-scoped: the backend resolves the worker from the token, so this page can
// never show anyone else's figures.
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

const STATE_LABEL = { IDLE: 'Idle', SLEEPING: 'Sleeping', HIDDEN: 'Tab away' }

const th = { textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--ink-soft)' }
const td = { padding: '9px 10px', fontSize: 12, borderBottom: '1px solid var(--line)' }

export default function MyIdle() {
  const [month, setMonth] = useState(thisMonth)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [openDate, setOpenDate] = useState(null)
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
    api(`/fro/reports/idle/me?from=${from}&to=${to}`, { _prefix: 'ucs' })
      .then((data) => { if (!cancelled) setReport(data) })
      .catch((err) => { if (!cancelled) { setReport(null); setError(err.message || 'Failed to load idle history') } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [from, to])

  const total = report?.total || {}
  const daily = report?.daily || []
  const activeDays = daily.filter((d) => d.idle_seconds > 0).length

  const toggleDay = async (date) => {
    if (openDate === date) { setOpenDate(null); return }
    setOpenDate(date)
    if (sessions[date]) return
    setSessions((s) => ({ ...s, [date]: { loading: true, data: null, error: null } }))
    try {
      const data = await api(`/fro/reports/idle/me/sessions?date=${date}`, { _prefix: 'ucs' })
      if (aliveRef.current) setSessions((s) => ({ ...s, [date]: { loading: false, data, error: null } }))
    } catch (err) {
      if (aliveRef.current) setSessions((s) => ({ ...s, [date]: { loading: false, data: null, error: err.message } }))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>My Idle</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>Idle time recorded by the server, split by day.</div>
        </div>
        <input
          type="month"
          value={month}
          max={thisMonth()}
          onChange={(e) => setMonth(e.target.value || thisMonth())}
          style={{ marginLeft: 'auto', padding: '8px 12px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: '#fff' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
        {[
          ['Total idle', formatDuration(total.idle_seconds || 0), '#b91c1c'],
          ['Worked', formatDuration(total.worked_seconds || 0), '#16a34a'],
          ['Days with idle', String(activeDays), 'var(--ink)'],
          ['Meeting', formatDuration(total.meeting_seconds || 0), '#6d28d9'],
        ].map(([label, value, color]) => (
          <div key={label} className="card" style={{ padding: '12px 14px', marginBottom: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 600, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, fontSize: 12, color: 'var(--ink-soft)' }}>Loading…</div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 40, fontSize: 12, color: '#b91c1c' }}>{error}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th style={th}>Day</th>
                <th style={{ ...th, textAlign: 'right' }}>Idle</th>
                <th style={{ ...th, textAlign: 'right' }}>Worked</th>
                <th style={{ ...th, textAlign: 'right' }}>Meeting</th>
                <th style={{ ...th, textAlign: 'right' }}>Internet</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <Fragment key={d.date}>
                  <tr>
                    <td style={{ ...td, fontWeight: 700 }}>{d.date}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: d.idle_seconds > 0 ? '#b91c1c' : 'var(--ink-soft)' }}>{formatDuration(d.idle_seconds)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{formatDuration(d.worked_seconds)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{formatDuration(d.meeting_seconds)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{formatDuration(d.internet_problem_seconds)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {d.idle_seconds > 0 && (
                        <button
                          onClick={() => toggleDay(d.date)}
                          style={{ border: 'none', background: 'none', color: '#287FE8', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                        >
                          {openDate === d.date ? 'Hide' : 'Sessions'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {openDate === d.date && (
                    <tr key={`${d.date}-sessions`}>
                      <td colSpan={6} style={{ padding: '8px 10px 14px', background: '#FBFDFF' }}>
                        {sessions[d.date]?.loading ? <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Loading…</div>
                          : sessions[d.date]?.error ? <div style={{ fontSize: 11, color: '#b91c1c' }}>{sessions[d.date].error}</div>
                          : (sessions[d.date]?.data?.sessions || []).length === 0 ? <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>No sessions.</div>
                          : (sessions[d.date]?.data?.sessions || []).map((x, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569', background: '#F6F9FD', borderRadius: 6, padding: '5px 8px', marginTop: 4 }}>
                              <span>
                                <b style={{ color: 'var(--ink)' }}>{fmtClock(x.started_at)}</b> – {x.open ? 'now' : fmtClock(x.ended_at)}
                                {' '}<span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: '#EFF6FF', color: '#287FE8' }}>{STATE_LABEL[x.state] || x.state}</span>
                              </span>
                              <b>{formatDuration(x.duration_seconds)}</b>
                            </div>
                          ))}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
