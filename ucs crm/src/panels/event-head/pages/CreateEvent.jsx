import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CATEGORIES, PRIORITIES, fetchWorkspaceNgos, fetchSectors, fetchActivities, fetchCSRPartners, fetchDonors, createEvent } from '../store'
import { PageHeader } from '../components/ui'

const STEPS = [
  { id: 'program', label: 'Program', sub: 'NGO · Sector · Activity' },
  { id: 'details', label: 'Details', sub: 'Name · Date · Venue' },
  { id: 'location', label: 'Location', sub: 'GPS · District · Team' },
  { id: 'impact', label: 'Impact', sub: 'Budget · Beneficiaries' },
]

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
  const [step, setStep] = useState(0)
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

  const validateStep = (i) => {
    setError('')
    if (i === 0) {
      if (!form.ngo_id) { setError('NGO is required'); setStep(0); return false }
      if (!form.sector_id) { setError('Sector is required'); setStep(0); return false }
      if (!form.activity_id) { setError('Activity is required'); setStep(0); return false }
    }
    if (form.start_time && form.end_time && form.end_time < form.start_time) {
      setError('End time must be after start time'); return false
    }
    return true
  }

  const next = () => { if (validateStep(step)) { setStep(s => Math.min(s + 1, STEPS.length - 1)) } }
  const back = () => { setError(''); setStep(s => Math.max(s - 1, 0)) }

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    if (!form.ngo_id) { setError('NGO is required'); setStep(0); setSaving(false); return }
    if (!form.sector_id) { setError('Sector is required'); setStep(0); setSaving(false); return }
    if (!form.activity_id) { setError('Activity is required'); setStep(0); setSaving(false); return }
    try {
      const payload = {
        ...form,
        ngo_id: Number(form.ngo_id),
        sector_id: Number(form.sector_id),
        activity_id: Number(form.activity_id),
      }
      for (const k of Object.keys(payload)) {
        if (payload[k] === '' || payload[k] === null || payload[k] === undefined) payload[k] = null
      }
      await createEvent(payload)
      navigate('/event-head/events')
    } catch (err) { setError(err.message || 'Failed to create event'); console.error('Create event error:', err) }
    finally { setSaving(false) }
  }

  const sectionLabel = (t) => <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--eh-primary)', margin: '18px 0 12px' }}>{t}</div>

  return (
    <>
      <PageHeader
        title="Create New Event"
        subtitle="Fill in the program context to build a complete event record"
        actions={<button className="eh-btn" onClick={() => navigate('/event-head/events')}>Cancel</button>}
      />

      <form onSubmit={handleSubmit} noValidate>
        <div className="eh-section" style={{ padding: '0 20px' }}>
          <div style={{ display: 'flex', gap: 4, padding: '6px 0', borderBottom: '1px solid var(--eh-line)' }}>
            {STEPS.map((s, i) => {
              const done = i < step
              const active = i === step
              return (
                <div key={s.id} onClick={() => { if (i < step || i === 0 || step > 0) setStep(i) }}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 12px', cursor: done || active ? 'pointer' : 'default', opacity: i > step ? 0.5 : 1 }}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0,
                    background: active ? 'linear-gradient(135deg,var(--eh-primary),var(--eh-secondary))' : done ? 'var(--eh-success)' : 'var(--eh-tint-1)',
                    color: active || done ? '#fff' : 'var(--eh-ink-soft)' }}>{done ? '✓' : i + 1}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 650, color: active || done ? 'var(--eh-ink)' : 'var(--eh-ink-soft)' }}>{s.label}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--eh-ink-faint)' }}>{s.sub}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {error && <div style={{ margin: '14px 0', padding: '12px 16px', borderRadius: 12, background: 'var(--eh-danger-soft)', color: 'var(--eh-danger)', fontSize: 13, fontWeight: 500 }}>{error}</div>}

        <div className="eh-section">
          <div className="eh-section-head">
            <div>
              <h3>{STEPS[step].label}</h3>
              <div className="eh-sub" style={{ fontSize: 12 }}>{STEPS[step].sub}</div>
            </div>
          </div>
          <div className="eh-section-body">
            {step === 0 && (
              <>
                {sectionLabel('Program Context')}
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
                      <div style={{ fontSize: 11, color: 'var(--eh-warn)', marginTop: 4 }}>No activities under this NGO + sector yet. Add one from the Activities page first.</div>
                    )}
                  </div>
                  <div className="field"><label>Category</label><select name="category" value={form.category} onChange={handleChange}>
                    <option value="">Select category</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select></div>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                {sectionLabel('Event Details')}
                <div className="form-row">
                  <div className="field"><label>Event Name *</label><input name="name" value={form.name} onChange={handleChange} required placeholder="e.g. Community Health Camp" /></div>
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
                  <div className="field"><label>Category (short)</label><input value={form.category || '—'} readOnly disabled /></div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                {sectionLabel('Location & Team')}
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
              </>
            )}

            {step === 3 && (
              <>
                {sectionLabel('Stakeholders & Impact')}
                <div className="form-row">
                  <div className="field"><label>CSR Partner</label><input name="csr_partner" value={form.csr_partner} onChange={handleChange} placeholder="Company name" /></div>
                  <div className="field"><label>Donor</label><input name="donor" value={form.donor} onChange={handleChange} /></div>
                </div>
                <div className="form-row">
                  <div className="field"><label>Expected Beneficiaries</label><input type="number" name="expected_beneficiaries" value={form.expected_beneficiaries} onChange={handleChange} /></div>
                  <div className="field"><label>Budget (₹)</label><input type="number" name="budget" value={form.budget} onChange={handleChange} /></div>
                </div>

                <div style={{ marginTop: 20, padding: '16px 18px', borderRadius: 14, background: 'var(--eh-tint-1)', border: '1px solid var(--eh-line)' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--eh-ink)', marginBottom: 10 }}>Review summary</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, fontSize: 12.5 }}>
                    <div><div style={{ color: 'var(--eh-ink-faint)', fontSize: 10.5 }}>Event</div><b>{form.name || '—'}</b></div>
                    <div><div style={{ color: 'var(--eh-ink-faint)', fontSize: 10.5 }}>Date</div><b>{form.date || '—'}</b></div>
                    <div><div style={{ color: 'var(--eh-ink-faint)', fontSize: 10.5 }}>Priority</div><b>{form.priority}</b></div>
                    <div><div style={{ color: 'var(--eh-ink-faint)', fontSize: 10.5 }}>Budget</div><b>{form.budget ? '₹' + Number(form.budget).toLocaleString() : '—'}</b></div>
                  </div>
                </div>
              </>
            )}

            <div className="eh-toolbar" style={{ marginTop: 24, justifyContent: 'flex-end' }}>
              {step > 0 && <button type="button" className="eh-btn" onClick={back}>← Back</button>}
              {step < STEPS.length - 1
                ? <button type="button" className="eh-btn eh-btn-primary" onClick={next}>Continue →</button>
                : <button type="submit" className="eh-btn eh-btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create Event'}</button>}
            </div>
          </div>
        </div>
      </form>
    </>
  )
}