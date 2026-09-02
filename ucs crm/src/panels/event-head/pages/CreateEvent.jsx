import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CATEGORIES, PRIORITIES, fetchWorkspaceNgos, fetchSectors, fetchActivities, createEvent, createActivity } from '../store'
import { PageHeader } from '../components/ui'

export default function CreateEvent() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [ngos, setNgos] = useState([])
  const [sectors, setSectors] = useState([])
  const [allActivities, setAllActivities] = useState([])
  const [form, setForm] = useState({
    name:'', category:'', ngo_id: searchParams.get('ngo_id') || '', sector_id: searchParams.get('sector_id') || '', activityName:'',
    date:'', start_time:'', end_time:'', venue:'', priority:'Medium', banner:'',
    gps_location:'', district:'', state:'', organizer:'', event_manager:'', coordinator:'',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetchWorkspaceNgos().catch(() => []),
      fetchSectors().catch(() => []),
      fetchActivities().catch(() => []),
    ]).then(([n, s, a]) => {
      setNgos(n || [])
      setSectors(s || [])
      setAllActivities(a || [])
    })
  }, [])

  const ngoId = form.ngo_id ? String(form.ngo_id) : ''
  const sectorId = form.sector_id ? String(form.sector_id) : ''

  const relevantSectors = useMemo(() => {
    const ids = new Set()
    for (const a of allActivities) {
      if (a.ngo_id == null || String(a.ngo_id) === ngoId) ids.add(String(a.sector_id))
    }
    let list = sectors.filter(s => ids.has(String(s.id)))
    if (!list.some(s => String(s.id) === sectorId) && form.sector_id) {
      const cur = sectors.find(s => String(s.id) === sectorId)
      if (cur) list = [cur, ...list]
    }
    return list
  }, [sectors, allActivities, ngoId, sectorId, form.sector_id])

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => {
      const next = { ...prev, [name]: value }
      if (name === 'ngo_id') { next.sector_id = ''; next.activityName = '' }
      if (name === 'sector_id') next.activityName = ''
      return next
    })
  }

  // Resolve the manually-typed activity: use an existing one for this NGO+sector,
  // otherwise create it on the fly. Returns the activity id, or null.
  const resolveActivity = async () => {
    const name = String(form.activityName || '').trim()
    if (!name) return null
    const match = allActivities.find(a =>
      String(a.sector_id) === String(form.sector_id) &&
      (a.ngo_id == null || String(a.ngo_id) === String(form.ngo_id)) &&
      String(a.name || '').trim().toLowerCase() === name.toLowerCase()
    )
    if (match) return match.id
    try {
      const created = await createActivity({ ngo_id: form.ngo_id, sector_id: Number(form.sector_id), name, status: 'Active' })
      return created ? created.id : null
    } catch (err) {
      // Duplicate (409) — try to find it again, else surface the error.
      const found = allActivities.find(a =>
        String(a.sector_id) === String(form.sector_id) &&
        String(a.name || '').trim().toLowerCase() === name.toLowerCase()
      )
      return found ? found.id : null
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    if (!form.name.trim()) { setError('Please enter an Event Name'); setSaving(false); return }
    if (!form.ngo_id) { setError('Please choose an NGO'); setSaving(false); return }
    if (!form.sector_id) { setError('Please choose a Sector'); setSaving(false); return }
    if (!form.date) { setError('Please choose an Event Date — it is required so the event shows on the Calendar'); setSaving(false); return }
    try {
      const typedActivity = String(form.activityName || '').trim()
      const activity_id = typedActivity ? await resolveActivity() : null
      if (typedActivity && !activity_id) { setError('Could not resolve the Activity. Please pick an existing sector and try again.'); setSaving(false); return }
      const payload = {
        name: form.name,
        category: form.category || null,
        ngo_id: form.ngo_id,
        sector_id: Number(form.sector_id),
        activity_id: activity_id ? Number(activity_id) : null,
        date: form.date || null,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        venue: form.venue || null,
        priority: form.priority || 'Medium',
        banner: form.banner || null,
        gps_location: form.gps_location || null,
        district: form.district || null,
        state: form.state || null,
        organizer: form.organizer || null,
        event_manager: form.event_manager || null,
        coordinator: form.coordinator || null,
      }
      await createEvent(payload)
      const params = new URLSearchParams({ ngo_id: form.ngo_id, created: 1 })
      if (form.sector_id) params.set('sector_id', form.sector_id)
      navigate('/event-head/events?' + params.toString())
    } catch (err) { setError(err.message || 'Failed to create event'); console.error('Create event error:', err) }
    finally { setSaving(false) }
  }

  const section = (t) => <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--eh-primary)', margin: '20px 0 12px' }}>{t}</div>

  return (
    <>
      <PageHeader
        title="Create New Event"
        subtitle="Fill in the details and click Create Event"
        actions={<button className="eh-btn" onClick={() => navigate('/event-head/events')}>Cancel</button>}
      />

      <form onSubmit={handleSubmit} noValidate>
        {error && <div style={{ margin: '14px 0', padding: '12px 16px', borderRadius: 12, background: 'var(--eh-danger-soft)', color: 'var(--eh-danger)', fontSize: 13, fontWeight: 500 }}>{error}</div>}

        <div className="eh-section">
          <div className="eh-section-head">
            <div>
              <h3>Event</h3>
              <div className="eh-sub" style={{ fontSize: 12 }}>Program, details and banner</div>
            </div>
          </div>
          <div className="eh-section-body">
            {section('Program')}
            <div className="form-row">
              <div className="field"><label>NGO *</label>
                <select name="ngo_id" value={form.ngo_id} onChange={handleChange}>
                  <option value="">Select NGO</option>
                  {ngos.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              </div>
              <div className="field"><label>Sector *</label>
                <select name="sector_id" value={form.sector_id} onChange={handleChange} disabled={!ngoId}>
                  <option value="">{ngoId ? 'Select sector' : 'Select NGO first'}</option>
                  {relevantSectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="field"><label>Activity</label>
                <input name="activityName" value={form.activityName || ''} onChange={handleChange} list="act-list" placeholder="Type the activity name (optional)" />
                <datalist id="act-list">
                  {allActivities.filter(a => String(a.sector_id) === String(form.sector_id)).map(a => <option key={a.id} value={a.name} />)}
                </datalist>
              </div>
              <div className="field"><label>Category</label>
                <input name="category" value={form.category} onChange={handleChange} list="cat-list" placeholder="Type or pick a category" />
                <datalist id="cat-list">{CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
              </div>
            </div>

            {section('Event Details')}
            <div className="form-row">
              <div className="field"><label>Event Name *</label><input name="name" value={form.name} onChange={handleChange} placeholder="e.g. Community Health Camp" required /></div>
              <div className="field"><label>Event Date *</label><input type="date" name="date" value={form.date} onChange={handleChange} required /></div>
            </div>
            <div className="form-row">
              <div className="field"><label>Start Time</label><input type="time" name="start_time" value={form.start_time} onChange={handleChange} /></div>
              <div className="field"><label>End Time</label><input type="time" name="end_time" value={form.end_time} onChange={handleChange} /></div>
              <div className="field"><label>Priority</label><select name="priority" value={form.priority} onChange={handleChange}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select></div>
            </div>
            <div className="form-row">
              <div className="field"><label>Venue</label><input name="venue" value={form.venue} onChange={handleChange} placeholder="Full address" /></div>
            </div>

            {section('Location & Team')}
            <div className="form-row">
              <div className="field"><label>GPS Location</label><input name="gps_location" value={form.gps_location} onChange={handleChange} placeholder="Lat, Lng" /></div>
              <div className="field"><label>District</label><input name="district" value={form.district} onChange={handleChange} /></div>
            </div>
            <div className="form-row">
              <div className="field"><label>State</label><input name="state" value={form.state} onChange={handleChange} /></div>
              <div className="field"><label>Organizer</label><input name="organizer" value={form.organizer} onChange={handleChange} /></div>
            </div>
            <div className="form-row">
              <div className="field"><label>Event Manager</label><input name="event_manager" value={form.event_manager} onChange={handleChange} /></div>
              <div className="field"><label>Coordinator</label><input name="coordinator" value={form.coordinator} onChange={handleChange} /></div>
            </div>

            {section('Banner (optional)')}
            <div className="field"><label>Banner image URL</label><input name="banner" value={form.banner} onChange={handleChange} placeholder="https://…/banner.jpg" /></div>
            <div style={{ fontSize: 12, color: 'var(--eh-ink-soft, #6b7280)', marginTop: 6 }}>Optional — you can submit without a banner, or add the banner later in Media / Banners under this event's NGO.</div>
            {form.banner && <img src={form.banner} alt="banner preview" style={{ marginTop: 8, maxHeight: 90, borderRadius: 10, objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none' }} />}

            <div className="eh-toolbar" style={{ marginTop: 24, justifyContent: 'flex-end' }}>
              <button type="submit" className="eh-btn eh-btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create Event'}</button>
            </div>
          </div>
        </div>
      </form>
    </>
  )
}
