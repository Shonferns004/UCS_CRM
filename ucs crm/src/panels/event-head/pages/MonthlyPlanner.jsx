import { useState, useEffect } from 'react'
import { fetchEventsByMonth, fetchNGOs, CATEGORIES, EVENT_STATUSES } from '../store'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const now = new Date()

export default function MonthlyPlanner() {
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [events, setEvents] = useState([])
  const [filterNgo, setFilterNgo] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [ngos, setNgos] = useState([])

  useEffect(() => { fetchNGOs().then(setNgos).catch(() => {}) }, [])
  useEffect(() => {
    fetchEventsByMonth(month + 1, year).then(setEvents).catch(() => {})
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

  const statusColor = (s) => {
    const map = { Completed:'#5B6B4E', Approved:'#3485D4', Draft:'#9ca3af', Rejected:'#B5603A', Cancelled:'#dc2626' }
    return map[s] || '#9ca3af'
  }

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h3>{MONTHS[month]} {year}</h3>
          <div style={{display:'flex',gap:6}}>
            <button className="btn btn-sm" onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }}>← Prev</button>
            <button className="btn btn-sm" onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }}>Next →</button>
          </div>
        </div>
        <div className="card-pad">
          <div className="filter-bar">
            <select value={filterNgo} onChange={e => setFilterNgo(e.target.value)}>
              <option value="">All NGOs</option>
              {ngos.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
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
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginTop:12}}>
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
              <div key={d} style={{textAlign:'center',fontSize:11,color:'var(--ink-soft)',padding:'4px 0',fontWeight:600}}>{d}</div>
            ))}
            {weeks.flat().map((d, i) => (
              <div key={i} style={{
                minHeight:80,background:'var(--card-bg)',border:'1px solid var(--line)',borderRadius:'var(--radius-sm)',
                padding:4,fontSize:12,position:'relative'
              }}>
                {d && <span style={{position:'absolute',top:3,right:5,fontWeight:600,fontSize:11,color:new Date(year,month,d).toDateString() === new Date().toDateString() ? 'var(--sage)' : 'var(--ink-soft)'}}>{d}</span>}
                {d && getEventsForDay(d).slice(0,2).map(ev => (
                  <div key={ev.id} style={{
                    marginTop:16,marginBottom:2,padding:'1px 4px',borderRadius:3,fontSize:10,
                    background:statusColor(ev.status)+'22',color:statusColor(ev.status),
                    overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'
                  }} title={ev.name}>{ev.name}</div>
                ))}
                {d && getEventsForDay(d).length > 2 && <div style={{fontSize:9,color:'var(--ink-soft)',textAlign:'center'}}>+{getEventsForDay(d).length - 2} more</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card" style={{marginTop:16}}>
        <div className="card-head"><h3>Events This Month</h3></div>
        <div className="card-pad" style={{padding:0}}>
          <table>
            <thead><tr><th>Date</th><th>Event</th><th>Category</th><th>Venue</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={5} style={{textAlign:'center',padding:24,color:'var(--ink-soft)'}}>No events this month</td></tr>}
              {filtered.sort((a,b) => new Date(a.date) - new Date(b.date)).map(ev => (
                <tr key={ev.id}>
                  <td>{ev.date?.slice(0,10)}</td>
                  <td style={{fontWeight:500}}>{ev.name}</td>
                  <td>{ev.category}</td>
                  <td>{ev.venue}</td>
                  <td><span className={`pill pill-${ev.status === 'Completed' ? 'green' : ev.status === 'Approved' ? 'blue' : ev.status === 'Draft' ? 'gray' : 'red'}`}>{ev.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
