import { useState, useEffect } from 'react'
import { api } from '../api/auth'

export default function Causes() {
  const [causes, setCauses] = useState([])
  const [ngos, setNgos] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [edit, setEdit] = useState(null)
  const [form, setForm] = useState({ ngo_id: '', name: '', description: '', file_url: '', file_name: '' })
  const [err, setErr] = useState('')
  const [filterNgo, setFilterNgo] = useState('')

  const load = () => {
    api('/causes').then(setCauses).catch(e => setErr(e.message))
    api('/ngos').then(setNgos).catch((err) => { console.error('Error:', err.message); })
  }
  useEffect(load, [])

  const openNew = () => { setEdit(null); setForm({ ngo_id: '', name: '', description: '', file_url: '', file_name: '' }); setShowForm(true) }
  const openEdit = (c) => { setEdit(c); setForm({ ngo_id: c.ngo_id, name: c.name, description: c.description || '', file_url: c.file_url || '', file_name: c.file_name || '' }); setShowForm(true) }

  const save = async () => {
    setErr('')
    try {
      if (edit) {
        await api(`/causes/${edit.id}`, { method: 'PUT', body: JSON.stringify(form) })
      } else {
        await api('/causes', { method: 'POST', body: JSON.stringify(form) })
      }
      setShowForm(false); load()
    } catch (e) { setErr(e.message) }
  }

  const toggleActive = async (id) => {
    try { await api(`/causes/${id}/toggle`, { method: 'PUT' }); load() }
    catch (e) { setErr(e.message) }
  }

  const remove = async (id) => {
    if (!confirm('Delete this cause?')) return
    try { await api(`/causes/${id}`, { method: 'DELETE' }); load() }
    catch (e) { setErr(e.message) }
  }

  const ngoMap = {}
  ngos.forEach(n => { ngoMap[n.id] = n })

  const filtered = filterNgo ? causes.filter(c => c.ngo_id === filterNgo) : causes

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <h3>Causes Management</h3>
        <button className="btn btn-primary" onClick={openNew}>+ New Cause</button>
      </div>
      {err && <div className="sa-err-card">{err}</div>}

      {showForm && (
        <div className="sa-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="sa-modal" onClick={e => e.stopPropagation()}>
            <h3>{edit ? 'Edit Cause' : 'New Cause'}</h3>
            <label className="field">NGO
              <select value={form.ngo_id} onChange={e => setForm({...form, ngo_id: e.target.value})}>
                <option value="">— Select NGO —</option>
                {ngos.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </label>
            <label className="field">Cause Name <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></label>
            <label className="field">Description <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></label>
            <label className="field">File URL <input value={form.file_url} onChange={e => setForm({...form, file_url: e.target.value})} placeholder="https://..." /></label>
            <label className="field">File Name <input value={form.file_name} onChange={e => setForm({...form, file_name: e.target.value})} placeholder="filename.pdf" /></label>
            <div className="sa-modal-actions">
              <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}

      <div className="sa-filters">
        <select value={filterNgo} onChange={e => setFilterNgo(e.target.value)}>
          <option value="">All NGOs</option>
          {ngos.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
      </div>

      <div className="sa-card">
        <table className="sa-table">
          <thead><tr><th>Name</th><th>NGO</th><th>Description</th><th>File</th><th>Status</th><th style={{width:160}}></th></tr></thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{ngoMap[c.ngo_id]?.name || '—'}</td>
                <td className="sa-muted" style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.description || '—'}</td>
                <td>{c.file_url ? <a href={c.file_url} target="_blank" rel="noreferrer" className="sa-link">{c.file_name || 'View'}</a> : '—'}</td>
                <td><span className={`sa-badge ${c.is_active !== false ? 'active' : 'inactive'}`}>
                  {c.is_active !== false ? 'Active' : 'Inactive'}
                </span></td>
                <td>
                  <button className="btn btn-sm" onClick={() => openEdit(c)}>Edit</button>
                  <button className="btn btn-sm" style={{marginLeft:4}} onClick={() => toggleActive(c.id)}>
                    {c.is_active !== false ? 'Deactivate' : 'Activate'}
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => remove(c.id)} style={{marginLeft:4}}>Del</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="sa-muted sa-center">No causes found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
