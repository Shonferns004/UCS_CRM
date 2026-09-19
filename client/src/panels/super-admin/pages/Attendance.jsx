import { useState, useEffect } from 'react'
import { api } from '../api/auth'

const IST_OFFSET = 5.5 * 60 * 60 * 1000
const STATUS_OPTIONS = ['present', 'late', 'half-day', 'absent', 'leave']

const toTimeInput = (iso) => {
  if (!iso) return ''
  const d = new Date(new Date(iso).getTime() + IST_OFFSET)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

const toIsoTimestamp = (date, time) => {
  if (!time) return null
  const [h, min] = time.split(':').map(Number)
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET + (h * 60 + min) * 60000).toISOString()
}

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
  const [editor, setEditor] = useState(null)
  const [saving, setSaving] = useState(false)

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

  const reload = () => api('/attendance/all').then(setRecords).catch(e => setErr(e.message))

  const openEditor = (worker, date, rec) => setEditor({
    worker,
    date,
    id: rec?.id || null,
    status: rec?.status || 'absent',
    punchIn: toTimeInput(rec?.punch_in_time),
    punchOut: toTimeInput(rec?.punch_out_time),
    lateMinutes: String(rec?.late_minutes ?? 0),
  })

  const saveEditor = async () => {
    if (!editor) return
    setSaving(true)
    try {
      const body = {
        date: editor.date,
        status: editor.status,
        punch_in_time: toIsoTimestamp(editor.date, editor.punchIn),
        punch_out_time: toIsoTimestamp(editor.date, editor.punchOut),
        late_minutes: Math.max(0, parseInt(editor.lateMinutes || '0', 10) || 0),
      }
      if (editor.id) await api(`/attendance/${editor.id}`, { method: 'PUT', body: JSON.stringify(body) })
      else await api('/attendance', { method: 'POST', body: JSON.stringify({ worker_id: editor.worker.id, ...body }) })
      setEditor(null)
      await reload()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

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
                       <td key={d} className="sa-att-cell" onClick={() => openEditor(g.worker, dateStr, rec)} style={{color: rec ? statusColor(rec.status) : '#e5e7eb', cursor: 'pointer'}} title="Click to edit attendance">
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

      {editor && (
        <div className="sa-card" style={{ marginTop: 16, maxWidth: 620 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <strong>Edit Attendance: {editor.worker?.name || editor.worker?.id} · {editor.date}</strong>
            <button className="btn btn-sm" onClick={() => setEditor(null)}>Close</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12 }}>
            <label>Status<select value={editor.status} onChange={e => setEditor({ ...editor, status: e.target.value })}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s === 'half-day' ? 'Half-day' : s[0].toUpperCase() + s.slice(1)}</option>)}
            </select></label>
            <label>Punch In<input type="time" value={editor.punchIn} onChange={e => setEditor({ ...editor, punchIn: e.target.value })} /></label>
            <label>Punch Out<input type="time" value={editor.punchOut} onChange={e => setEditor({ ...editor, punchOut: e.target.value })} /></label>
            <label>Late Minutes<input type="number" min="0" value={editor.lateMinutes} onChange={e => setEditor({ ...editor, lateMinutes: e.target.value })} /></label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={() => setEditor({ ...editor, status: 'half-day' })}>Set Half-day</button>
            <button className="btn btn-sm" onClick={() => setEditor({ ...editor, status: 'present' })}>Remove Half-day</button>
            <button className="btn btn-sm btn-primary" style={{ marginLeft: 'auto' }} onClick={saveEditor} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
