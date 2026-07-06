import { useState, useEffect } from 'react'
import { fetchVolunteers, createVolunteer, fetchEvents } from '../store'

export default function VolunteerManagement() {
  const [volunteers, setVolunteers] = useState([])
  const [events, setEvents] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name:'', mobile:'', email:'', duty:'' })

  useEffect(() => {
    Promise.all([fetchVolunteers().catch(() => []), fetchEvents().catch(() => [])])
      .then(([v,e]) => { setVolunteers(v); setEvents(e) })
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    await createVolunteer(form).then((res) => { setVolunteers([...volunteers, res]); setShowForm(false); setForm({name:'',mobile:'',email:'',duty:''}) }).catch(() => {})
  }

  return (
    <>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h3 style={{fontSize:16}}>Volunteer Management</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Add Volunteer</button>
      </div>
      {showForm && (
        <div className="card" style={{marginBottom:16}}>
          <div className="card-head"><h3>Register Volunteer</h3></div>
          <div className="card-pad">
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="field"><label>Name</label><input value={form.name} onChange={e => setForm({...form,name:e.target.value})} required /></div>
                <div className="field"><label>Mobile</label><input value={form.mobile} onChange={e => setForm({...form,mobile:e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="field"><label>Email</label><input type="email" value={form.email} onChange={e => setForm({...form,email:e.target.value})} /></div>
                <div className="field"><label>Assigned Duty</label><input value={form.duty} onChange={e => setForm({...form,duty:e.target.value})} /></div>
              </div>
              <div style={{marginTop:12,display:'flex',gap:8}}>
                <button type="submit" className="btn btn-primary btn-sm">Save</button>
                <button type="button" className="btn btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="card">
        <div className="card-pad" style={{padding:0}}>
          <table>
            <thead><tr><th>Name</th><th>Mobile</th><th>Email</th><th>Duty</th><th>Status</th></tr></thead>
            <tbody>
              {volunteers.length === 0 && <tr><td colSpan={5} style={{textAlign:'center',padding:24,color:'var(--ink-soft)'}}>No volunteers registered</td></tr>}
              {volunteers.map(v => (
                <tr key={v.id}>
                  <td style={{fontWeight:500}}>{v.name}</td>
                  <td>{v.mobile}</td><td>{v.email}</td><td>{v.duty}</td>
                  <td><span className={`pill pill-${v.attended ? 'green' : 'gray'}`}>{v.attended ? 'Attended' : 'Pending'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
