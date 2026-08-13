import { useState, useEffect } from 'react'
import { api } from '../api/auth'

export default function Notices() {
  const [notices, setNotices] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [edit, setEdit] = useState(null)
  const [form, setForm] = useState({ title: '', content: '' })
  const [err, setErr] = useState('')

  const load = () => { api('/notices').then(setNotices).catch(e => setErr(e.message)) }
  useEffect(load, [])

  const openNew = () => { setEdit(null); setForm({ title: '', content: '' }); setShowForm(true) }
  const openEdit = (n) => { setEdit(n); setForm({ title: n.title, content: n.content || '' }); setShowForm(true) }

  const save = async () => {
    setErr('')
    try {
      if (edit) await api(`/notices/${edit.id}`, { method: 'PUT', body: JSON.stringify(form) })
      else await api('/notices', { method: 'POST', body: JSON.stringify(form) })
      setShowForm(false); load()
    } catch (e) { setErr(e.message) }
  }

  const remove = async (id) => {
    if (!confirm('Delete?')) return
    try { await api(`/notices/${id}`, { method: 'DELETE' }); load() }
    catch (e) { setErr(e.message) }
  }

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <h3>Notices</h3>
        <button className="btn btn-primary" onClick={openNew}>+ New Notice</button>
      </div>
      {err && <div className="sa-err-card">{err}</div>}

      {showForm && (
        <div className="sa-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="sa-modal" onClick={e => e.stopPropagation()}>
            <h3>{edit ? 'Edit Notice' : 'New Notice'}</h3>
            <label className="field">Title <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} /></label>
            <label className="field">Content <textarea rows={4} value={form.content} onChange={e => setForm({...form, content: e.target.value})} /></label>
            <div className="sa-modal-actions">
              <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}

      <div className="sa-card-grid">
        {notices.map(n => (
          <div key={n.id} className="sa-notice-card">
            <div className="sa-notice-header">
              <h4>{n.title}</h4>
              <div>
                <button className="btn btn-sm" onClick={() => openEdit(n)}>Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => remove(n.id)} style={{marginLeft:4}}>Del</button>
              </div>
            </div>
            <div className="sa-notice-date">{n.created_at ? new Date(n.created_at).toLocaleDateString() : ''}</div>
            <div className="sa-notice-content">{n.content || ''}</div>
          </div>
        ))}
        {notices.length === 0 && <p className="sa-muted">No notices</p>}
      </div>
    </div>
  )
}
