import { useState, useEffect } from 'react'
import { fetchEvents, fetchEventAttendance, markAttendance } from '../store'

export default function AttendanceManagement() {
  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState('')
  const [attendance, setAttendance] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name:'', type:'Staff', status:'Present' })

  useEffect(() => { fetchEvents().then(setEvents).catch(() => {}) }, [])
  useEffect(() => {
    if (!selectedEvent) { setAttendance([]); return }
    fetchEventAttendance(selectedEvent).then(setAttendance).catch(() => {})
  }, [selectedEvent])

  const handleSubmit = async (e) => {
    e.preventDefault()
    await markAttendance(selectedEvent, form).then((res) => { setAttendance([...attendance, res]); setShowForm(false); setForm({name:'',type:'Staff',status:'Present'}) }).catch(() => {})
  }

  const counts = { Present:0, Absent:0, Late:0 }
  attendance.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++ })

  return (
    <>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:10}}>
        <h3 style={{fontSize:16}}>Event Attendance</h3>
        <div style={{display:'flex',gap:8}}>
          <select value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)} style={{padding:'6px 10px',border:'1px solid var(--line)',borderRadius:'var(--radius-sm)',fontSize:13}}>
            <option value="">Select Event</option>
            {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)} disabled={!selectedEvent}>+ Mark</button>
        </div>
      </div>
      {selectedEvent && (
        <>
          {showForm && (
            <div className="card" style={{marginBottom:16}}>
              <div className="card-head"><h3>Mark Attendance</h3></div>
              <div className="card-pad">
                <form onSubmit={handleSubmit}>
                  <div className="form-row">
                    <div className="field"><label>Name</label><input value={form.name} onChange={e => setForm({...form,name:e.target.value})} required /></div>
                    <div className="field"><label>Type</label>
                      <select value={form.type} onChange={e => setForm({...form,type:e.target.value})}>
                        <option value="Staff">Staff</option><option value="Volunteer">Volunteer</option><option value="Guest">Guest</option>
                      </select>
                    </div>
                  </div>
                  <div className="field"><label>Status</label>
                    <select value={form.status} onChange={e => setForm({...form,status:e.target.value})}>
                      <option value="Present">Present</option><option value="Absent">Absent</option><option value="Late">Late</option>
                    </select>
                  </div>
                  <div style={{marginTop:12,display:'flex',gap:8}}>
                    <button type="submit" className="btn btn-primary btn-sm">Save</button>
                    <button type="button" className="btn btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
            {Object.entries(counts).map(([k,v]) => (
              <div key={k} className="stat-card" style={{textAlign:'center'}}>
                <div className="stat-num">{v}</div>
                <div className="stat-lbl">{k}</div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-pad" style={{padding:0}}>
              <table>
                <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Time</th></tr></thead>
                <tbody>
                  {attendance.length === 0 && <tr><td colSpan={4} style={{textAlign:'center',padding:24,color:'var(--ink-soft)'}}>No attendance recorded</td></tr>}
                  {attendance.map(a => (
                    <tr key={a.id}>
                      <td style={{fontWeight:500}}>{a.name}</td>
                      <td><span className={`pill pill-${a.type === 'Staff' ? 'blue' : a.type === 'Volunteer' ? 'purple' : 'gray'}`}>{a.type}</span></td>
                      <td><span className={`pill pill-${a.status === 'Present' ? 'green' : a.status === 'Absent' ? 'red' : 'yellow'}`}>{a.status}</span></td>
                      <td>{a.created_at?.slice(11,19) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      {!selectedEvent && <div className="card"><div className="card-pad" style={{textAlign:'center',padding:40,color:'var(--ink-soft)'}}>Select an event to manage attendance</div></div>}
    </>
  )
}
