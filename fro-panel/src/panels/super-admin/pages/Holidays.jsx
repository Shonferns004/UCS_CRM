import { useState, useEffect } from 'react'
import { api } from '../api/auth'
import { DatePicker } from '../components/ui'

export default function Holidays() {
  const [holidays, setHolidays] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [edit, setEdit] = useState(null)
  const [form, setForm] = useState({ title: '', date: '', type: 'public' })
  const [err, setErr] = useState('')

  const load = () => {
    api('/holidays').then(setHolidays).catch(e => setErr(e.message))
  }
  useEffect(load, [])

  const openNew = () => { setEdit(null); setForm({ title: '', date: '', type: 'public' }); setShowForm(true) }
  const openEdit = (h) => { setEdit(h); setForm({ title: h.title, date: h.date ? h.date.slice(0, 10) : '', type: h.type || 'public' }); setShowForm(true) }

  const save = async () => {
    setErr('')
    try {
      if (edit) {
        await api(`/holidays/${edit.id}`, { method: 'PUT', body: JSON.stringify(form) })
      } else {
        await api('/holidays', { method: 'POST', body: JSON.stringify(form) })
      }
      setShowForm(false); load()
    } catch (e) { setErr(e.message) }
  }

  const remove = async (id) => {
    if (!confirm('Delete?')) return
    try { await api(`/holidays/${id}`, { method: 'DELETE' }); load() }
    catch (e) { setErr(e.message) }
  }

  const sorted = [...holidays].sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <h3>Holidays</h3>
        <button className="btn btn-primary" onClick={openNew}>+ Add Holiday</button>
      </div>
      {err && <div className="sa-err-card">{err}</div>}

      {showForm && (
        <div className="sa-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="sa-modal" onClick={e => e.stopPropagation()}>
            <h3>{edit ? 'Edit Holiday' : 'Add Holiday'}</h3>
            <label className="field">Title <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} /></label>
            <label className="field">Date <DatePicker value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></label>
            <label className="field">Type
              <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                <option value="public">Public</option>
                <option value="optional">Optional</option>
                <option value="company">Company</option>
              </select>
            </label>
            <div className="sa-modal-actions">
              <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}

      <div className="sa-card">
        <table className="sa-table">
          <thead><tr><th>Date</th><th>Title</th><th>Type</th><th style={{width:120}}></th></tr></thead>
          <tbody>
            {sorted.map(h => (
              <tr key={h.id}>
                <td>{h.date ? new Date(h.date).toLocaleDateString() : '—'}</td>
                <td>{h.title}</td>
                <td><span className="sa-badge">{h.type || 'public'}</span></td>
                <td>
                  <button className="btn btn-sm" onClick={() => openEdit(h)}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => remove(h.id)} style={{marginLeft:4}}>Del</button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && <tr><td colSpan={4} className="sa-muted sa-center">No holidays</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
