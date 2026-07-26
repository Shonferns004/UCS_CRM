import { useState, useEffect } from 'react'
import { api } from '../api/auth'

export default function Attendance() {
  const [records, setRecords] = useState([])
  const [workers, setWorkers] = useState([])
  const [search, setSearch] = useState('')
  const [filterNgo, setFilterNgo] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [month, setMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [err, setErr] = useState('')

  useEffect(() => {
    api('/attendance/all').then(setRecords).catch(e => setErr(e.message))
    api('/workers').then(setWorkers).catch((err) => { console.error('Error:', err.message); })
  }, [])

  const [year, m] = month.split('-')
  const monthRecords = records.filter(r => {
    const d = r.date || ''
    return d.startsWith(`${year}-${m}`)
  })

  const workerMap = {}
  workers.forEach(w => { workerMap[w.id] = w })

  const grouped = {}
  monthRecords.forEach(r => {
    if (!grouped[r.worker_id]) grouped[r.worker_id] = { worker: workerMap[r.worker_id], days: {} }
    grouped[r.worker_id].days[r.date] = r
  })

  let entries = Object.entries(grouped)

  if (search) {
    const s = search.toLowerCase()
    entries = entries.filter(([, g]) => (g.worker?.name || '').toLowerCase().includes(s))
  }

  const daysInMonth = new Date(parseInt(year), parseInt(m), 0).getDate()
  const dayHeaders = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'))

  const statusColor = (status) => {
    if (status === 'present') return '#10b981'
    if (status === 'late') return '#f59e0b'
    if (status === 'absent') return '#ef4444'
    if (status === 'half-day') return '#8b5cf6'
    if (status === 'leave') return '#3b82f6'
    return '#d1d5db'
  }

  const countStatus = (days, status) => Object.values(days).filter(d => d.status === status).length

  const stats = monthRecords.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="sa-page">
      <h3>Attendance</h3>
      {err && <div className="sa-err-card">{err}</div>}

      <div className="sa-filters">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
        <input placeholder="Search worker…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="sa-card">
        <div style={{display:'flex', gap:16, marginBottom:12, flexWrap:'wrap'}}>
          {Object.entries(stats).map(([k, v]) => (
            <div key={k} className="sa-mini-stat"><span style={{color:statusColor(k),fontWeight:600}}>{k}</span>: {v}</div>
          ))}
        </div>

        <div className="sa-att-table-wrap">
          <table className="sa-table sa-att-table">
            <thead>
              <tr>
                <th style={{position:'sticky',left:0,background:'var(--bg-card)',zIndex:2,minWidth:140}}>Worker</th>
                {dayHeaders.map(d => <th key={d} className="sa-att-day">{d}</th>)}
                <th style={{minWidth:40}}>P</th>
                <th style={{minWidth:40}}>L</th>
                <th style={{minWidth:40}}>A</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([wid, g]) => (
                <tr key={wid}>
                  <td style={{position:'sticky',left:0,background:'var(--bg-card)',zIndex:1}}>
                    {g.worker?.name || `ID ${wid}`}
                  </td>
                  {dayHeaders.map(d => {
                    const dateStr = `${year}-${m}-${d}`
                    const rec = g.days[dateStr]
                    return (
                      <td key={d} className="sa-att-cell" style={{color: rec ? statusColor(rec.status) : '#e5e7eb'}}>
                        {rec ? (rec.status === 'present' ? 'P' : rec.status === 'late' ? 'L' : rec.status === 'absent' ? 'A' : rec.status === 'half-day' ? 'HD' : rec.status === 'leave' ? 'LV' : '?') : '·'}
                      </td>
                    )
                  })}
                  <td style={{fontWeight:600,color:'#10b981'}}>{countStatus(g.days, 'present') + countStatus(g.days, 'late')}</td>
                  <td style={{fontWeight:600,color:'#f59e0b'}}>{countStatus(g.days, 'late')}</td>
                  <td style={{fontWeight:600,color:'#ef4444'}}>{countStatus(g.days, 'absent')}</td>
                </tr>
              ))}
              {entries.length === 0 && <tr><td colSpan={daysInMonth + 4} className="sa-muted sa-center">No records for this month</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
