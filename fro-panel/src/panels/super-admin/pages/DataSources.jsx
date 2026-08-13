import { useState, useEffect } from 'react'
import { api } from '../api/auth'

export default function DataSources() {
  const [sources, setSources] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [edit, setEdit] = useState(null)
  const [form, setForm] = useState({ name: '' })
  const [err, setErr] = useState('')

  const load = () => {
    api('/data-sources').then(setSources).catch(e => setErr(e.message))
  }
  useEffect(load, [])

  const openNew = () => { setEdit(null); setForm({ name: '' }); setShowForm(true) }
  const openEdit = (s) => { setEdit(s); setForm({ name: s.name }); setShowForm(true) }

  const save = async () => {
    setErr('')
    try {
      if (edit) {
        await api(`/data-sources/${edit.id}`, { method: 'PUT', body: JSON.stringify(form) })
      } else {
        await api('/data-sources', { method: 'POST', body: JSON.stringify(form) })
      }
      setShowForm(false); load()
    } catch (e) { setErr(e.message) }
  }

  const toggleActive = async (id) => {
    try { await api(`/data-sources/${id}/toggle`, { method: 'PUT' }); load() }
    catch (e) { setErr(e.message) }
  }

  const remove = async (id) => {
    if (!confirm('Delete this data source?')) return
    try { await api(`/data-sources/${id}`, { method: 'DELETE' }); load() }
    catch (e) { setErr(e.message) }
  }

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <h3>Data Source Management</h3>
        <button className="btn btn-primary" onClick={openNew}>+ New Data Source</button>
      </div>
      {err && <div className="sa-err-card">{err}</div>}

      {showForm && (
        <div className="sa-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="sa-modal" onClick={e => e.stopPropagation()}>
            <h3>{edit ? 'Edit Data Source' : 'New Data Source'}</h3>
            <label className="field">Name <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></label>
            <div className="sa-modal-actions">
              <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}

      <div className="sa-card">
        <table className="sa-table">
          <thead><tr><th>Name</th><th>Status</th><th>Created</th><th style={{width:160}}></th></tr></thead>
          <tbody>
            {sources.map(s => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td><span className={`sa-badge ${s.is_active !== false ? 'active' : 'inactive'}`}>
                  {s.is_active !== false ? 'Active' : 'Inactive'}
                </span></td>
                <td className="sa-muted">{s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</td>
                <td>
                  <button className="btn btn-sm" onClick={() => openEdit(s)}>Edit</button>
                  <button className="btn btn-sm" style={{marginLeft:4}} onClick={() => toggleActive(s.id)}>
                    {s.is_active !== false ? 'Deactivate' : 'Activate'}
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => remove(s.id)} style={{marginLeft:4}}>Del</button>
                </td>
              </tr>
            ))}
            {sources.length === 0 && <tr><td colSpan={4} className="sa-muted sa-center">No data sources</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
