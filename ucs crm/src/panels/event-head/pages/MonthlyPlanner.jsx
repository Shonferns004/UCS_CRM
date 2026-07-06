import { useState, useEffect } from 'react'
import { fetchEventsByMonth, fetchNGOs, CATEGORIES, EVENT_STATUSES } from '../store'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const now = new Date()

const statusStyle = (s) => {
  const map = { Completed: { bg: '#5B6B4E18', color: '#5B6B4E' }, Approved: { bg: '#3485D418', color: '#3485D4' }, Draft: { bg: '#9ca3af18', color: '#9ca3af' }, Rejected: { bg: '#B5603A18', color: '#B5603A' }, Cancelled: { bg: '#dc262618', color: '#dc2626' }, Submitted: { bg: '#C08A2E18', color: '#C08A2E' }, Postponed: { bg: '#f59e0b18', color: '#f59e0b' } }
  return map[s] || { bg: '#9ca3af18', color: '#9ca3af' }
}

export default function MonthlyPlanner() {
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [events, setEvents] = useState([])
  const [filterNgo, setFilterNgo] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [ngos, setNgos] = useState([])

  useEffect(() => { fetchNGOs().then(setNgos).catch(e => console.error('MonthlyPlanner fetchNGOs:', e)) }, [])
  useEffect(() => {
    fetchEventsByMonth(month + 1, year).then(setEvents).catch(e => {
      console.error('MonthlyPlanner fetchEventsByMonth:', e)
      setEvents([])
    })
  }, [month, year])

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()
  const weeks = []
  let cells = Array(firstDay).fill(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d)
    if (cells.length === 7) { weeks.push(cells); cells = [] }
  }
  if (cells.length) { while (cells.length < 7) cells.push(null); weeks.push(cells) }

  const filtered = events.filter(e => {
    if (filterNgo && e.ngo_id !== filterNgo) return false
    if (filterCategory && e.category !== filterCategory) return false
    if (filterStatus && e.status !== filterStatus) return false
    return true
  })

  const getEventsForDay = (day) => filtered.filter(e => {
    const d = new Date(e.date); return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year
  })

  const isToday = (d) => {
    const today = new Date()
    return d === today.getDate() && month === today.getMonth() && year === today.getFullYear()
  }

  const navigateMonth = (delta) => {
    let m = month + delta
    let y = year
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setMonth(m); setYear(y)
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>{MONTHS[month]} {year}</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={() => navigateMonth(-1)}>← Prev</button>
          <button className="btn btn-sm" onClick={() => { setMonth(now.getMonth()); setYear(now.getFullYear()) }}>Today</button>
          <button className="btn btn-sm" onClick={() => navigateMonth(1)}>Next →</button>
        </div>
      </div>
      <div className="card-pad">
        <div className="filter-bar">
          <select value={filterNgo} onChange={e => setFilterNgo(e.target.value)}>
            <option value="">All NGOs</option>
            {ngos.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
            {['BSCT','MANN','AFLF'].map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            {EVENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginTop: 12 }}>
          {DAYS.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-soft)', padding: '6px 0', fontWeight: 600 }}>{d}</div>
          ))}
          {weeks.flat().map((d, i) => {
            const dayEvents = d ? getEventsForDay(d) : []
            const today = isToday(d)
            return (
              <div key={i} style={{
                minHeight: 90, background: today ? 'var(--sage-light)' : 'var(--card-bg)',
                border: today ? '1px solid var(--sage)' : '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)', padding: 4, fontSize: 12, position: 'relative', transition: 'box-shadow .15s'
              }}>
                {d && (
                  <span style={{
                    position: 'absolute', top: 3, right: 5, fontWeight: 700, fontSize: 12,
                    color: today ? 'var(--sage)' : 'var(--ink-soft)',
                    background: today ? 'var(--card-bg)' : 'transparent',
                    borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>{d}</span>
                )}
                <div style={{ marginTop: 22 }}>
                  {dayEvents.slice(0, 3).map(ev => {
                    const s = statusStyle(ev.status)
                    return (
                      <div key={ev.id} style={{
                        marginBottom: 2, padding: '2px 5px', borderRadius: 3, fontSize: 10,
                        background: s.bg, color: s.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500
                      }} title={ev.name}>{ev.name}</div>
                    )
                  })}
                  {dayEvents.length > 3 && <div style={{ fontSize: 9, color: 'var(--ink-soft)', textAlign: 'center', marginTop: 1 }}>+{dayEvents.length - 3} more</div>}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          {['Completed','Approved','Submitted','Draft','Cancelled','Rejected'].map(s => {
            const st = statusStyle(s)
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ink-soft)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: st.color }} />
                {s}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--line)' }}>
        <div className="card-head"><h3>Events This Month</h3></div>
        <div className="card-pad" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Date</th><th>Event</th><th>Category</th><th>Venue</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--ink-soft)' }}>No events this month</td></tr>}
              {filtered.sort((a,b) => new Date(a.date) - new Date(b.date)).map(ev => (
                <tr key={ev.id}>
                  <td>{ev.date?.slice(0,10)}</td>
                  <td style={{ fontWeight: 500 }}>{ev.name}</td>
                  <td>{ev.category}</td>
                  <td>{ev.venue}</td>
                  <td><span className={`pill pill-${ev.status === 'Completed' ? 'green' : ev.status === 'Approved' ? 'blue' : ev.status === 'Draft' ? 'gray' : 'red'}`}>{ev.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
