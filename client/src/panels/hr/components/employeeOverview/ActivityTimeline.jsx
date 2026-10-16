import { useMemo, useState } from 'react'

// Read-only activity timeline — union of the dated tables that record this
// worker (leaves, salary, loans, corrections, profile requests, targets).
// history_unavailable is surfaced verbatim: the union is NOT a complete audit
// trail, and the component never implies otherwise.

const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN')

const TYPES = {
  joined:    { label: 'Joined',        color: '#5B6B4E', bg: '#eef3ea' },
  salary:    { label: 'Salary',        color: '#1d4ed8', bg: '#e8effd' },
  leave:     { label: 'Leave',         color: '#b45309', bg: '#fff4e0' },
  loan:      { label: 'Loan',          color: '#7c3aed', bg: '#f3ecfd' },
  correction:{ label: 'Attendance',    color: '#be123c', bg: '#fde8ee' },
  profile:   { label: 'Profile',       color: '#0f766e', bg: '#e6f5f3' },
  target:    { label: 'Target',        color: '#3d4a34', bg: '#eef3ea' },
}
const FILTERS = ['All', 'Salary', 'Leave', 'Loan', 'Attendance', 'Profile', 'Target']

const fmtDate = (day) => {
  const d = new Date(`${day}T00:00:00Z`)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export default function ActivityTimeline({ data, loading, error }) {
  const [filter, setFilter] = useState('All')

  const groups = useMemo(() => {
    const events = (data?.events || []).filter(e => filter === 'All' || (TYPES[e.type]?.label) === filter)
    const byMonth = new Map()
    for (const e of events) {
      const key = (e.date || '').slice(0, 7)
      if (!byMonth.has(key)) byMonth.set(key, [])
      byMonth.get(key).push(e)
    }
    return [...byMonth.entries()]
  }, [data, filter])

  const c = data?.contribution

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line, #e5e7eb)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginRight: 'auto' }}>Activity</div>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              fontSize: 11, padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
              border: '1px solid var(--line, #e5e7eb)',
              background: filter === f ? 'var(--sage, #5B6B4E)' : 'transparent',
              color: filter === f ? '#fff' : 'var(--ink-soft, #64748b)',
              fontWeight: filter === f ? 600 : 400,
            }}
          >{f}</button>
        ))}
      </div>

      {c && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'var(--bg, #f1f5fb)', border: '1px solid var(--line, #e5e7eb)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'baseline', fontSize: 12 }}>
            <span style={{ fontWeight: 700 }}>{inr(c.value)}</span>
            <span style={{ color: 'var(--ink-soft, #64748b)' }}>{c.label}</span>
            <span style={{ color: 'var(--ink-soft, #64748b)', fontSize: 11 }}>
              ({inr(c.collection)} collection − {inr(c.salary)} salary)
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft, #64748b)', marginTop: 4 }}>{c.note}</div>
        </div>
      )}

      {loading ? (
        <div className="sk" style={{ height: 120, borderRadius: 8 }} />
      ) : error ? (
        <div className="empty" style={{ padding: '18px 0', textAlign: 'center', fontSize: 12 }}>Could not load activity.</div>
      ) : groups.length === 0 ? (
        <div className="empty" style={{ padding: '18px 0', textAlign: 'center', fontSize: 12 }}>No activity in this period.</div>
      ) : (
        <div style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
          {groups.map(([month, evts]) => (
            <div key={month} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft, #64748b)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {evts.map((e, i) => {
                  const t = TYPES[e.type] || { label: e.type, color: 'var(--ink-soft)', bg: 'var(--bg)' }
                  return (
                    <div key={`${e.date}-${i}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line, #e5e7eb)', background: 'var(--paper, #fff)' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, color: t.color, background: t.bg, padding: '3px 7px', borderRadius: 999, whiteSpace: 'nowrap', minWidth: 74, textAlign: 'center' }}>
                        {t.label}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{e.title}</div>
                        {e.detail && <div style={{ fontSize: 11, color: 'var(--ink-soft, #64748b)' }}>{e.detail}</div>}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--ink-soft, #64748b)', whiteSpace: 'nowrap' }}>{e.date ? fmtDate(e.date) : ''}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {data?.truncated && (
            <div style={{ fontSize: 11, color: 'var(--ink-soft, #64748b)', textAlign: 'center' }}>
              Showing latest 200 of {data.total_events} events — narrow the range for older ones.
            </div>
          )}
        </div>
      )}

      {data?.history_unavailable?.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--ink-soft, #64748b)', borderTop: '1px solid var(--line, #e5e7eb)', paddingTop: 8 }}>
          Not a complete audit trail — {data.history_unavailable.length} known gap{data.history_unavailable.length === 1 ? '' : 's'}: {data.history_unavailable.join('; ')}.
        </div>
      )}
    </div>
  )
}
