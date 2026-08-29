import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { fetchActivityById, fetchSectors, fetchWorkspaceNgos, updateActivity, setActivityStatus } from '../store'

export default function ActivityDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [activity, setActivity] = useState(null)
  const [ngos, setNgos] = useState([])
  const [sectors, setSectors] = useState([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    fetchActivityById(id)
      .then(data => setActivity(data))
      .catch(e => { console.error('ActivityDetail fetch:', e); setActivity(null) })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    Promise.all([fetchWorkspaceNgos().catch(() => []), fetchSectors().catch(() => [])])
      .then(([n, s]) => { setNgos(n || []); setSectors(s || []) })
    load()
  }, [id])

  const startEdit = () => {
    setForm({ name: activity.name, ngo_id: activity.ngo_id ? String(activity.ngo_id) : '', sector_id: activity.sector_id ? String(activity.sector_id) : '', description: activity.description || '', banner: activity.banner || '' })
    setError('')
    setEditing(true)
  }

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const updated = await updateActivity(id, {
        name: form.name.trim(),
        ngo_id: form.ngo_id ? Number(form.ngo_id) : null,
        sector_id: Number(form.sector_id),
        description: form.description || null,
        banner: form.banner || null,
      })
      setActivity({ ...activity, ...updated })
      setEditing(false)
    } catch (err) {
      setError(err.message || 'Failed to save activity')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async () => {
    const next = activity.status === 'Active' ? 'Inactive' : 'Active'
    if (!confirm(next === 'Inactive' ? 'Deactivate this activity?' : 'Activate this activity?')) return
    try {
      await setActivityStatus(id, next)
      setActivity({ ...activity, status: next })
    } catch (err) { alert('Failed to update status: ' + (err.message || 'Unknown error')) }
  }

  if (loading) return <div className="loading">Loading activity...</div>
  if (!activity) return (
    <div className="empty-state">
      <h3>Activity not found</h3>
      <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={() => navigate('/event-head/activities')}>Back to Activities</button>
    </div>
  )

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={() => navigate('/event-head/activities')}>← Activities</button>
        <h3 style={{ fontSize: 16 }}>Activity Details</h3>
        {!editing && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => navigate('/event-head/create?ngo_id=' + (activity.ngo_id || '') + '&sector_id=' + activity.sector_id + '&activity_id=' + activity.id)}>+ Create Event</button>
            <button className="btn btn-sm" onClick={startEdit}>Edit</button>
            {activity.status === 'Active'
              ? <button className="btn btn-sm" style={{ color: '#dc2626', borderColor: '#fecaca' }} onClick={handleToggle}>Deactivate</button>
              : <button className="btn btn-sm" style={{ color: '#16a34a', borderColor: '#bbf7d0' }} onClick={handleToggle}>Activate</button>}
          </div>
        )}
      </div>

      {editing ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><h3>Edit Activity</h3></div>
          <form onSubmit={handleSave}>
            <div className="card-pad">
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="field"><label>Activity Name *</label><input name="name" value={form.name} onChange={handleChange} required /></div>
              </div>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="field"><label>NGO</label><select name="ngo_id" value={form.ngo_id} onChange={handleChange}>
                  <option value="">All NGOs</option>
                  {ngos.map(n => <option key={n.id} value={n.id}>{n.name || n.code}</option>)}
                </select></div>
                <div className="field"><label>Sector *</label><select name="sector_id" value={form.sector_id} onChange={handleChange} required>
                  <option value="">Select sector</option>
                  {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
              </div>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="field"><label>Description</label><textarea name="description" value={form.description} onChange={handleChange} rows={3} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} /></div>
              </div>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="field"><label>Banner Image URL</label><input name="banner" value={form.banner} onChange={handleChange} placeholder="https://..." /></div>
              </div>
              {error && <div style={{ marginBottom: 10, fontSize: 12, color: '#dc2626' }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
                <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          </form>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 16 }}>
          <div className="card">
            <div className="card-pad">
              {activity.banner ? (
                <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginBottom: 12 }}>
                  <img src={activity.banner} alt={activity.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none' }} />
                </div>
              ) : null}
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{activity.name}</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <span className={`pill ${activity.status === 'Active' ? 'pill-green' : 'pill-gray'}`}>{activity.status}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, fontSize: 13 }}>
                <div><span style={{ color: 'var(--ink-soft)' }}>NGO:</span> <b>{activity.ngo_name || '—'}</b></div>
                <div><span style={{ color: 'var(--ink-soft)' }}>Sector:</span> <b>{activity.sector_name || '—'}</b></div>
                <div><span style={{ color: 'var(--ink-soft)' }}>Events:</span> <b>{activity.event_count || 0}</b></div>
                <div><span style={{ color: 'var(--ink-soft)' }}>Created:</span> {activity.created_at ? new Date(activity.created_at).toLocaleDateString() : '—'}</div>
                {activity.sector_description && <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5, marginTop: 4 }}>{activity.sector_description}</div>}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <h3>Activity Description</h3>
            </div>
            <div className="card-pad" style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--ink)' }}>
              {activity.description || 'No description added yet.'}
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head"><h3>Events under this activity ({activity.event_count || 0})</h3></div>
        <div className="card-pad" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Event</th><th>Date</th><th>Venue</th><th>Status</th></tr></thead>
            <tbody>
              {(activity.events || []).length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--ink-soft)' }}>No events linked to this activity yet</td></tr>}
              {(activity.events || []).map(ev => (
                <tr key={ev.id}>
                  <td style={{ fontWeight: 500 }}><Link to={'/event-head/events/' + ev.id} style={{ color: 'var(--ink)', textDecoration: 'none' }}>{ev.name}</Link></td>
                  <td>{ev.date ? ev.date.slice(0, 10) : '—'}</td>
                  <td>{ev.venue || '—'}</td>
                  <td><span className="pill pill-gray">{ev.status || '—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}