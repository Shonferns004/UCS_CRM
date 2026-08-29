import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CATEGORIES, PRIORITIES, fetchWorkspaceNgos, fetchSectors, fetchActivities, fetchCSRPartners, fetchDonors, createEvent } from '../store'

export default function CreateEvent() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [ngos, setNgos] = useState([])
  const [sectors, setSectors] = useState([])
  const [allActivities, setAllActivities] = useState([])
  const [csrPartners, setCsrPartners] = useState([])
  const [donors, setDonors] = useState([])
  const [form, setForm] = useState({
    name:'', category:'', ngo_id: searchParams.get('ngo_id') || '', sector_id: searchParams.get('sector_id') || '', activity_id: searchParams.get('activity_id') || '',
    date:'', start_time:'', end_time:'', venue:'', gps_location:'',
    district:'', state:'', organizer:'', event_manager:'', coordinator:'',
    expected_beneficiaries:'', budget:'', priority:'Medium'
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetchWorkspaceNgos().catch(() => []),
      fetchSectors().catch(() => []),
      fetchActivities().catch(() => []),
      fetchCSRPartners().catch(() => []),
      fetchDonors().catch(() => []),
    ]).then(([n, s, a, c, d]) => {
      setNgos(n || [])
      setSectors(s || [])
      setAllActivities(a || [])
      setCsrPartners(c || [])
      setDonors(d || [])
    })
  }, [])

  const ngoId = form.ngo_id ? String(form.ngo_id) : ''
  const sectorId = form.sector_id ? String(form.sector_id) : ''

  // Sectors relevant to the chosen NGO (all-NGO activities count for every NGO).
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

  // Activities belonging to the chosen NGO + sector (all-NGO activities included).
  const relevantActivities = useMemo(() => {
    let list = allActivities.filter(a =>
      String(a.sector_id) === sectorId &&
      (a.ngo_id == null || String(a.ngo_id) === ngoId)
    )
    if (form.activity_id && !list.some(a => String(a.id) === String(form.activity_id))) {
      const cur = allActivities.find(a => String(a.id) === String(form.activity_id) && String(a.sector_id) === sectorId)
      if (cur) list = [cur, ...list]
    }
    return list
  }, [allActivities, ngoId, sectorId, form.activity_id])

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => {
      const next = { ...prev, [name]: value }
      if (name === 'ngo_id') { next.sector_id = ''; next.activity_id = '' }
      if (name === 'sector_id') next.activity_id = ''
      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    if (!form.ngo_id) { setError('NGO is required'); setSaving(false); return }
    if (!form.sector_id) { setError('Sector is required'); setSaving(false); return }
    if (!form.activity_id) { setError('Activity is required'); setSaving(false); return }
    if (form.start_time && form.end_time && form.end_time < form.start_time) {
      setError('End time must be after start time'); setSaving(false); return
    }
    try {
      const payload = {
        ...form,
        ngo_id: Number(form.ngo_id),
        sector_id: Number(form.sector_id),
        activity_id: Number(form.activity_id),
      }
      for (const k of Object.keys(payload)) {
        if (payload[k] === '' || payload[k] === null || payload[k] === undefined) {
          payload[k] = null
        }
      }
      await createEvent(payload)
      navigate('/event-head/events')
    } catch (err) { setError(err.message || 'Failed to create event'); console.error('Create event error:', err) }
    finally { setSaving(false) }
  }

  return (
    <div className="card">
      <div className="card-head"><h3>Create New Event</h3></div>
      <div className="card-pad">
        <form onSubmit={handleSubmit}>

          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-soft)', marginBottom: 12 }}>Program Context</div>
          <div className="form-row">
            <div className="field"><label>NGO *</label>
              <select name="ngo_id" value={form.ngo_id} onChange={handleChange} required>
                <option value="">Select NGO</option>
                {ngos.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Sector *</label>
              <select name="sector_id" value={form.sector_id} onChange={handleChange} required disabled={!ngoId}>
                <option value="">{ngoId ? 'Select sector' : 'Select NGO first'}</option>
                {relevantSectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="field"><label>Activity *</label>
              <select name="activity_id" value={form.activity_id} onChange={handleChange} required disabled={!sectorId}>
                <option value="">{sectorId ? 'Select activity' : 'Select sector first'}</option>
                {relevantActivities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {sectorId && relevantActivities.length === 0 && (
                <div style={{ fontSize: 11, color: '#B5603A', marginTop: 4 }}>No activities under this NGO + sector yet. Add one from the Activities page first.</div>
              )}
            </div>
            <div className="field"><label>Category</label><select name="category" value={form.category} onChange={handleChange}>
              <option value="">Select category</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select></div>
          </div>
          {searchParams.get('sector_id') && (
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 10 }}>
              Prefilled from Activity Details — you can still change the selections above.
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-soft)', margin: '20px 0 12px' }}>Event Details</div>
          <div className="form-row">
            <div className="field"><label>Event Name *</label><input name="name" value={form.name} onChange={handleChange} required placeholder="e.g. Community Health Camp" /></div>
            <div className="field"><label>Event Date *</label><input type="date" name="date" value={form.date} onChange={handleChange} required /></div>
          </div>
          <div className="form-row">
            <div className="field"><label>Start Time</label><input type="time" name="start_time" value={form.start_time} onChange={handleChange} /></div>
            <div className="field"><label>End Time</label><input type="time" name="end_time" value={form.end_time} onChange={handleChange} /></div>
          </div>
          <div className="form-row">
            <div className="field"><label>Priority</label><select name="priority" value={form.priority} onChange={handleChange}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select></div>
            <div className="field"><label>Venue</label><input name="venue" value={form.venue} onChange={handleChange} placeholder="Full address" /></div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-soft)', margin: '20px 0 12px' }}>Location</div>
          <div className="form-row">
            <div className="field"><label>GPS Location</label><input name="gps_location" value={form.gps_location} onChange={handleChange} placeholder="Lat, Lng" /></div>
            <div className="field"><label>District</label><input name="district" value={form.district} onChange={handleChange} /></div>
          </div>
          <div className="form-row">
            <div className="field"><label>State</label><input name="state" value={form.state} onChange={handleChange} /></div>
            <div className="field"><label>Organizer</label><input name="organizer" value={form.organizer} onChange={handleChange} /></div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-soft)', margin: '20px 0 12px' }}>Stakeholders</div>
          <div className="form-row">
            <div className="field"><label>CSR Partner</label><input name="csr_partner" value={form.csr_partner} onChange={handleChange} placeholder="Company name" /></div>
            <div className="field"><label>Donor</label><input name="donor" value={form.donor} onChange={handleChange} /></div>
          </div>
          <div className="form-row">
            <div className="field"><label>Event Manager</label><input name="event_manager" value={form.event_manager} onChange={handleChange} /></div>
            <div className="field"><label>Coordinator</label><input name="coordinator" value={form.coordinator} onChange={handleChange} /></div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-soft)', margin: '20px 0 12px' }}>Budget &amp; Impact</div>
          <div className="form-row">
            <div className="field"><label>Expected Beneficiaries</label><input type="number" name="expected_beneficiaries" value={form.expected_beneficiaries} onChange={handleChange} /></div>
            <div className="field"><label>Budget (₹)</label><input type="number" name="budget" value={form.budget} onChange={handleChange} /></div>
          </div>

          {error && <div style={{ marginTop: 14, fontSize: 12, color: '#dc2626' }}>{error}</div>}

          <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating...' : 'Create Event'}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => navigate('/event-head/events')}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}