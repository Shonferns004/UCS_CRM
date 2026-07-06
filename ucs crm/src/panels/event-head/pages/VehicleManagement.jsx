import { useState, useEffect } from 'react'
import { fetchVehicles, createVehicle, fetchEvents } from '../store'

export default function VehicleManagement() {
  const [vehicles, setVehicles] = useState([])
  const [events, setEvents] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ vehicle_name:'', driver:'', fuel:'', kilometer_reading:'', assigned_event:'' })

  useEffect(() => {
    Promise.all([fetchVehicles().catch(() => []), fetchEvents().catch(() => [])])
      .then(([v,e]) => { setVehicles(v); setEvents(e) })
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    await createVehicle(form).then((res) => { setVehicles([...vehicles, res]); setShowForm(false); setForm({vehicle_name:'',driver:'',fuel:'',kilometer_reading:'',assigned_event:''}) }).catch(() => {})
  }

  return (
    <>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h3 style={{fontSize:16}}>Vehicle Management</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Assign Vehicle</button>
      </div>
      {showForm && (
        <div className="card" style={{marginBottom:16}}>
          <div className="card-head"><h3>Assign Vehicle</h3></div>
          <div className="card-pad">
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="field"><label>Vehicle</label><input value={form.vehicle_name} onChange={e => setForm({...form,vehicle_name:e.target.value})} required /></div>
                <div className="field"><label>Driver</label><input value={form.driver} onChange={e => setForm({...form,driver:e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="field"><label>Fuel</label><input value={form.fuel} onChange={e => setForm({...form,fuel:e.target.value})} placeholder="Liters" /></div>
                <div className="field"><label>KM Reading</label><input value={form.kilometer_reading} onChange={e => setForm({...form,kilometer_reading:e.target.value})} /></div>
              </div>
              <div className="field"><label>Assigned Event</label>
                <select value={form.assigned_event} onChange={e => setForm({...form,assigned_event:e.target.value})}>
                  <option value="">Select</option>{events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
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
      <div className="card">
        <div className="card-pad" style={{padding:0}}>
          <table>
            <thead><tr><th>Vehicle</th><th>Driver</th><th>Fuel</th><th>KM</th><th>Event</th><th>Status</th></tr></thead>
            <tbody>
              {vehicles.length === 0 && <tr><td colSpan={6} style={{textAlign:'center',padding:24,color:'var(--ink-soft)'}}>No vehicles assigned</td></tr>}
              {vehicles.map(v => (
                <tr key={v.id}>
                  <td style={{fontWeight:500}}>{v.vehicle_name}</td>
                  <td>{v.driver}</td><td>{v.fuel}</td><td>{v.kilometer_reading}</td>
                  <td>{events.find(e => e.id === v.assigned_event)?.name || '—'}</td>
                  <td><span className={`pill pill-${v.status === 'Returned' ? 'green' : v.status === 'In Transit' ? 'yellow' : 'blue'}`}>{v.status || 'Assigned'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
