import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchEvents, fetchEventDashboard } from '../store'

export default function EventDashboard() {
  const navigate = useNavigate()
  const [dash, setDash] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchEvents(), fetchEventDashboard().catch(() => null)])
      .then(([events, db]) => {
        setDash({
          total: events?.length || 0,
          upcoming: events?.filter(e => e.status === 'Approved' && new Date(e.date) > new Date()).length || 0,
          today: events?.filter(e => e.date === new Date().toISOString().slice(0,10)).length || 0,
          completed: events?.filter(e => e.status === 'Completed').length || 0,
          cancelled: events?.filter(e => ['Cancelled','Postponed'].includes(e.status)).length || 0,
          ...(db || {})
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const cards = [
    { label:'Total Events', value:dash?.total, color:'#7B5EA7' },
    { label:'Upcoming', value:dash?.upcoming, color:'#3485D4' },
    { label:"Today's Events", value:dash?.today, color:'#C08A2E' },
    { label:'Completed', value:dash?.completed, color:'#5B6B4E' },
    { label:'Cancelled/Postponed', value:dash?.cancelled, color:'#B5603A' },
  ]

  if (loading) return <div className="loading">Loading dashboard...</div>

  return (
    <>
      <div className="stats-grid">
        {cards.map(c => (
          <div key={c.label} className="stat-card" style={{borderLeft:`3px solid ${c.color}`}}>
            <div className="stat-num" style={{color:c.color}}>{c.value ?? '—'}</div>
            <div className="stat-lbl">{c.label}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-head"><h3>Upcoming Events</h3></div>
        <div className="card-pad" style={{padding:0}}>
          <table>
            <thead>
              <tr><th>Event</th><th>Date</th><th>Venue</th><th>Status</th></tr>
            </thead>
            <tbody>
              <tr><td colSpan={4} style={{textAlign:'center',padding:24,color:'var(--ink-soft)'}}>No upcoming events</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
