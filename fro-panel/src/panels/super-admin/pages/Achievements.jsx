import { useState, useEffect } from 'react'
import { api } from '../api/auth'
import { getWorkers } from '../api/endpoints'

export default function Achievements() {
  const [achievements, setAchievements] = useState([])
  const [workers, setWorkers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ worker_id: '', title: '', description: '' })
  const [err, setErr] = useState('')

  const load = () => {
    api('/achievements').then(setAchievements).catch(e => setErr(e.message))
    getWorkers().then(setWorkers).catch((err) => { console.error('Error:', err.message); })
  }
  useEffect(load, [])

  const openNew = () => { setForm({ worker_id: '', title: '', description: '' }); setShowForm(true) }

  const award = async () => {
    setErr('')
    try {
      await api('/achievements', { method: 'POST', body: JSON.stringify(form) })
      setShowForm(false); load()
    } catch (e) { setErr(e.message) }
  }

  const remove = async (id) => {
    if (!confirm('Delete this achievement?')) return
    try { await api(`/achievements/${id}`, { method: 'DELETE' }); load() }
    catch (e) { setErr(e.message) }
  }

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <h3>Achievements</h3>
        <button className="btn btn-primary" onClick={openNew}>+ Award Achievement</button>
      </div>
      {err && <div className="sa-err-card">{err}</div>}

      {showForm && (
        <div className="sa-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="sa-modal" onClick={e => e.stopPropagation()}>
            <h3>Award Achievement</h3>
            <label className="field">Worker
              <select value={form.worker_id} onChange={e => setForm({...form, worker_id: e.target.value})}>
                <option value="">— Select —</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label className="field">Title <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} /></label>
            <label className="field">Description <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></label>
            <div className="sa-modal-actions">
              <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={award}>Award</button>
            </div>
          </div>
        </div>
      )}

      <div className="sa-card">
        <table className="sa-table">
          <thead><tr><th>Worker</th><th>Achievement</th><th>Date</th><th style={{width:80}}></th></tr></thead>
          <tbody>
            {achievements.map(a => (
              <tr key={a.id}>
                <td>{a.workers?.name || `ID ${a.worker_id}`}</td>
                <td style={{color:'#10b981',fontWeight:500}}>{a.title}</td>
                <td className="sa-muted">{a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
                <td><button className="btn btn-sm btn-danger" onClick={() => remove(a.id)}>Del</button></td>
              </tr>
            ))}
            {achievements.length === 0 && <tr><td colSpan={4} className="sa-muted sa-center">No achievements yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
