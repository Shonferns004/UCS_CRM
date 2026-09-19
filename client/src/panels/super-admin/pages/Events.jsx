import { useState, useEffect } from 'react'
import { api } from '../api/auth'
import { DatePicker } from '../components/ui'

export default function Events() {
  const [events, setEvents] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [edit, setEdit] = useState(null)
  const [form, setForm] = useState({ title: '', event_date: '', event_time: '', location: '', description: '' })
  const [err, setErr] = useState('')

  const load = () => { api('/events').then(setEvents).catch(e => setErr(e.message)) }
  useEffect(load, [])

  const openNew = () => { setEdit(null); setForm({ title: '', event_date: '', event_time: '', location: '', description: '' }); setShowForm(true) }
  const openEdit = (e) => { setEdit(e); setForm({ title: e.title, event_date: e.event_date ? e.event_date.slice(0, 10) : '', event_time: e.event_time || '', location: e.location || '', description: e.description || '' }); setShowForm(true) }

  const save = async () => {
    setErr('')
    try {
      if (edit) await api(`/events/${edit.id}`, { method: 'PUT', body: JSON.stringify(form) })
      else await api('/events', { method: 'POST', body: JSON.stringify(form) })
      setShowForm(false); load()
    } catch (e) { setErr(e.message) }
  }

  const remove = async (id) => {
    if (!confirm('Delete?')) return
    try { await api(`/events/${id}`, { method: 'DELETE' }); load() }
    catch (e) { setErr(e.message) }
  }

  const sorted = [...events].sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <h3>Events</h3>
        <button className="btn btn-primary" onClick={openNew}>+ New Event</button>
      </div>
      {err && <div className="sa-err-card">{err}</div>}

      {showForm && (
        <div className="sa-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="sa-modal" onClick={e => e.stopPropagation()}>
            <h3>{edit ? 'Edit Event' : 'New Event'}</h3>
            <label className="field">Title <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} /></label>
            <label className="field">Date <DatePicker value={form.event_date} onChange={e => setForm({...form, event_date: e.target.value})} /></label>
            <label className="field">Time <input type="time" value={form.event_time} onChange={e => setForm({...form, event_time: e.target.value})} /></label>
            <label className="field">Location <input value={form.location} onChange={e => setForm({...form, location: e.target.value})} /></label>
            <label className="field">Description <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></label>
            <div className="sa-modal-actions">
              <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}

      <div className="sa-card">
        <table className="sa-table">
          <thead><tr><th>Title</th><th>Date</th><th>Time</th><th>Location</th><th style={{width:120}}></th></tr></thead>
          <tbody>
            {sorted.map(ev => (
              <tr key={ev.id}>
                <td>{ev.title}</td>
                <td>{ev.event_date ? new Date(ev.event_date).toLocaleDateString('en-IN') : '—'}</td>
                <td>{ev.event_time ? ev.event_time.slice(0, 5) : '—'}</td>
                <td className="sa-muted">{ev.location || '—'}</td>
                <td>
                  <button className="btn btn-sm" onClick={() => openEdit(ev)}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => remove(ev.id)} style={{marginLeft:4}}>Del</button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && <tr><td colSpan={5} className="sa-muted sa-center">No events</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
