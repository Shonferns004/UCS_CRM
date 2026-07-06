import { useState, useEffect } from 'react'
import { fetchEvents, updateEventStatus, deleteEvent, EVENT_STATUSES } from '../store'

const statusColor = (s) => {
  const map = { Completed:'green', Approved:'blue', Draft:'gray', Submitted:'yellow', Rejected:'red', Cancelled:'red', Closed:'green', Postponed:'yellow' }
  return map[s] || 'gray'
}

export default function EventsPage() {
  const [events, setEvents] = useState([])
  const [filter, setFilter] = useState('')

  useEffect(() => { fetchEvents().then(setEvents).catch(() => {}) }, [])

  const handleStatus = async (id, status) => {
    await updateEventStatus(id, status).then(() => setEvents(events.map(e => e.id === id ? {...e, status} : e))).catch(() => {})
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this event?')) return
    await deleteEvent(id).then(() => setEvents(events.filter(e => e.id !== id))).catch(() => {})
  }

  const filtered = filter ? events.filter(e => e.status === filter) : events

  return (
    <>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:10}}>
        <h3 style={{fontSize:16}}>All Events</h3>
        <div className="filter-bar" style={{marginBottom:0}}>
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">All Status</option>
            {EVENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{fontSize:12,color:'var(--ink-soft)'}}>{filtered.length} events</span>
        </div>
      </div>
      <div className="card">
        <div className="card-pad" style={{padding:0}}>
          <table>
            <thead><tr><th>Event ID</th><th>Name</th><th>Date</th><th>Category</th><th>Venue</th><th>Beneficiaries</th><th>Budget</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={9} style={{textAlign:'center',padding:24,color:'var(--ink-soft)'}}>No events found</td></tr>}
              {filtered.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).map(ev => (
                <tr key={ev.id}>
                  <td style={{fontWeight:600,fontSize:12,color:'var(--ink-soft)'}}>#{ev.id}</td>
                  <td style={{fontWeight:500}}>{ev.name}</td>
                  <td>{ev.date?.slice(0,10)}</td>
                  <td>{ev.category}</td>
                  <td>{ev.venue}</td>
                  <td>{ev.expected_beneficiaries || '—'}</td>
                  <td>{ev.budget ? '₹' + Number(ev.budget).toLocaleString() : '—'}</td>
                  <td>
                    <select value={ev.status} onChange={e => handleStatus(ev.id, e.target.value)}
                      className={`pill pill-${statusColor(ev.status)}`}
                      style={{border:'none',fontSize:11,cursor:'pointer',padding:'2px 8px'}}>
                      {EVENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td><button className="btn btn-sm btn-icon" onClick={() => handleDelete(ev.id)} title="Delete">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
