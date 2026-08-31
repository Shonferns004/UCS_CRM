import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import { PageHeader, SearchInput, Select } from '../components/ui'
import {
  fetchCalendarEvents, fetchWorkspaceNgos, fetchSectors, fetchActivities,
  createEvent, updateEvent, deleteEvent,
  EVENT_STATUSES, PRIORITIES, CATEGORIES,
} from '../store'
import '../calendar.css'

const pad2 = (n) => String(n).padStart(2, '0')
const toYmd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const STATUS_PRIORITY = ['Draft','Submitted','Approved','Rejected','Completed','Closed','Cancelled','Postponed']

const ymdToLabel = (ymd) => {
  if (!ymd) return '—'
  const [y, m, d] = ymd.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}
const fmtTime = (t) => {
  if (!t) return null
  const hm = String(t).slice(0, 5).split(':')
  let h = Number(hm[0]); const m = Number(hm[1])
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ap}`
}

/* ── Event category (derived client-side for coloring) ── */
const CATEGORY_META = {
  'international-day': { label: 'International Day', color: '#0ea5e9', icon: '🌐' },
  'national-holiday': { label: 'National / Civic', color: '#f59e0b', icon: '🏛️' },
  'ngo-campaign': { label: 'NGO Campaign', color: '#16a34a', icon: '🤝' },
  'religious-observance': { label: 'Religious', color: '#8b5cf6', icon: '🕉️' },
  'awareness-day': { label: 'Awareness Day', color: '#ec4899', icon: '🔔' },
  'other': { label: 'Other', color: '#64748b', icon: '📌' },
}

const CATEGORY_KEYWORDS = [
  ['international-day', ['international', 'world', 'day of', 'day for', 'universal', "engineer's day", "grandparents' day", 'ozone', 'literacy', 'democracy', 'peace', 'translation', 'languages', 'tourism', 'bamboo', 'heart', 'rabies', 'rivers', 'first aid', 'physical therapy', 'patient safety', 'pharmacists', 'environmental health', 'contraception', 'access to information', 'red panda', 'sign languages', 'chocolate', 'charity', 'pirate']],
  ['national-holiday', ['independence', 'republic', 'national', 'teacher', 'diwas', 'antodaya', 'engineer', 'martyr', 'modi', 'google', 'digvijay']],
  ['ngo-campaign', ['campaign', 'drive', 'ngo', 'awareness drive']],
  ['religious-observance', ['puja', 'chaturdasi', 'janmashtami', 'diwali', 'holi', 'eid', 'navratri', 'vishwakarma', 'anant', 'religious', 'festival']],
  ['awareness-day', ['day', 'awareness', 'welfare']],
]

const deriveCategory = (name = '') => {
  const n = String(name).toLowerCase()
  if (!n) return 'other'
  // Religious keywords take priority over generic "Day" matches
  for (const w of CATEGORY_KEYWORDS[3][1]) if (n.includes(w)) return 'religious-observance'
  for (const w of CATEGORY_KEYWORDS[0][1]) if (n.includes(w)) return 'international-day'
  if (n.includes('campaign') || n.includes('drive')) return 'ngo-campaign'
  for (const w of CATEGORY_KEYWORDS[1][1]) if (n.includes(w)) return 'national-holiday'
  if (n.includes('day') || n.includes('awareness') || n.includes('welfare')) return 'awareness-day'
  return 'other'
}

const esc = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
// Strip the " · NGO" suffix the backend appends to titles so we can group by base name.
const baseTitle = (title, ngoName) => {
  const t = String(title || '')
  const n = String(ngoName || '').trim()
  if (n) {
    const re = new RegExp(`\\s*·\\s*${esc(n)}\\s*$`, 'i')
    return t.replace(re, '').trim()
  }
  return t
}
// Short NGO code: prefer the uppercased, whitespace-free code of the name.
const ngoCode = (name) => String(name || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 5) || 'NGO'

/* Group a list of calendar event objects by day + base title across NGOs. */
const groupCalendarEvents = (list) => {
  const map = new Map()
  for (const ev of list || []) {
    const p = ev.extendedProps || {}
    const date = p.date || (ev.startStr || '').slice(0, 10) || ''
    const bt = baseTitle(ev.title, p.ngoName)
    const key = `${date}||${bt.toLowerCase()}`
    if (!map.has(key)) {
      map.set(key, { date, baseTitle: bt, category: deriveCategory(bt), raw: ev, members: [] })
    }
    map.get(key).members.push(ev)
  }
  return [...map.values()]
}

const FIELD = { border: '1px solid var(--eh-line)', borderRadius: 10, padding: '8px 10px', width: '100%', fontSize: 13, color: 'var(--eh-ink)', background: '#fff' }
const LABEL = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--eh-ink-soft)', marginBottom: 5 }

function ModalShell({ title, onClose, children, footer }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [onClose])
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }} style={{ padding: 20, zIndex: 1200 }}>
      <div className="modal" style={{ maxWidth: 720, width: '100%', borderRadius: 16, background: '#fff', color: 'var(--eh-ink)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 70px rgba(0,0,0,0.24)' }}>
        <div className="modal-head" style={{ padding: '16px 20px', borderBottom: '1px solid var(--eh-line)', background: '#fff', display: 'flex', alignItems: 'center' }}>
          <h3 style={{ flex: 1, fontSize: 16, fontWeight: 700, color: 'var(--eh-ink)' }}>{title}</h3>
          <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, border: 'none', borderRadius: 8, background: 'transparent', cursor: 'pointer', color: 'var(--eh-ink-soft)' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px', background: '#fff' }}>{children}</div>
        {footer && <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--eh-line)', background: '#fff' }}>{footer}</div>}
      </div>
    </div>
  )
}

/* ── Event form (create / edit) ── */
function EventFormModal({ mode, initial, defaultDate, onClose, onSaved }) {
  const navigate = useNavigate()
  const [ngos, setNgos] = useState([])
  const [allSectors, setAllSectors] = useState([])
  const [allActivities, setAllActivities] = useState([])
  const [form, setForm] = useState(() => ({
    name: initial?.name || '',
    ngo_id: initial?.ngo_id || initial?.extendedProps?.ngoId || '',
    sector_id: initial?.sector_id || initial?.extendedProps?.sectorId || '',
    activities: (initial?.extendedProps?.activities || []).map(a => String(a.id)),
    date: initial?.extendedProps?.date || initial?.startStr?.slice(0, 10) || defaultDate || '',
    start_time: initial?.extendedProps?.startTime || (initial?.startStr ? initial.startStr.slice(11, 16) : ''),
    end_time: initial?.extendedProps?.endTime || (initial?.endStr ? initial.endStr.slice(11, 16) : ''),
    venue: initial?.extendedProps?.venue || '',
    description: initial?.extendedProps?.description || '',
    status: (initial?.extendedProps?.status) || 'Draft',
    priority: initial?.extendedProps?.priority || 'Medium',
    category: initial?.category || '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetchWorkspaceNgos().catch(() => []),
      fetchSectors().catch(() => []),
      fetchActivities().catch(() => []),
    ]).then(([n, s, a]) => {
      setNgos(n || []); setAllSectors(s || []); setAllActivities(a || [])
    })
  }, [])

  const ngoId = form.ngo_id ? String(form.ngo_id) : ''
  const sectorId = form.sector_id ? String(form.sector_id) : ''

  const sectorOptions = useMemo(() => {
    const ids = new Set()
    for (const a of allActivities) if (a.ngo_id == null || String(a.ngo_id) === ngoId) ids.add(String(a.sector_id))
    let list = allSectors.filter(s => ids.has(String(s.id)))
    if (!list.some(s => String(s.id) === sectorId) && form.sector_id) {
      const cur = allSectors.find(s => String(s.id) === sectorId); if (cur) list = [cur, ...list]
    }
    return list
  }, [allSectors, allActivities, ngoId, sectorId, form.sector_id])

  const activityOptions = useMemo(() => {
    let list = allActivities.filter(a => String(a.sector_id) === sectorId && (a.ngo_id == null || String(a.ngo_id) === ngoId))
    if (form.activities.length) {
      const extra = allActivities.filter(a => form.activities.includes(String(a.id)) && !list.some(x => String(x.id) === String(a.id)))
      list = [...extra, ...list]
    }
    return list
  }, [allActivities, ngoId, sectorId, form.activities])

  const toggleActivity = (id) => {
    setForm(p => {
      const set = new Set(p.activities)
      if (set.has(String(id))) set.delete(String(id)); else set.add(String(id))
      return { ...p, activities: [...set] }
    })
  }

  const change = (e) => {
    const { name, value } = e.target
    setForm(p => {
      const next = { ...p, [name]: value }
      if (name === 'ngo_id') { next.sector_id = ''; next.activities = [] }
      if (name === 'sector_id') next.activities = []
      return next
    })
  }

  const submit = async () => {
    setSaving(true); setError('')
    if (!form.name) { setError('Event name is required'); setSaving(false); return }
    if (!form.ngo_id) { setError('NGO is required'); setSaving(false); return }
    if (!form.sector_id) { setError('Sector is required'); setSaving(false); return }
    if (!form.activities.length) { setError('Select at least one activity'); setSaving(false); return }
    if (!form.date) { setError('Event date is required'); setSaving(false); return }
    if (form.start_time && form.end_time && form.end_time < form.start_time) { setError('End time must be after start time'); setSaving(false); return }

    const payload = {
      name: form.name,
      ngo_id: Number(form.ngo_id),
      sector_id: Number(form.sector_id),
      activity_ids: form.activities.map(Number),
      date: form.date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      venue: form.venue || null,
      description: form.description || null,
      status: form.status,
      priority: form.priority,
      category: form.category || null,
    }
    // Preserve extra fields when editing (budget, beneficiaries, etc.)
    if (initial) {
      for (const k of ['budget','expected_beneficiaries','gps_location','district','state','organizer','event_manager','coordinator','csr_partner','donor']) {
        if (initial[k] != null) payload[k] = initial[k]
      }
    }
    try {
      if (mode === 'edit' && initial) {
        await updateEvent(initial.id, payload)
      } else {
        await createEvent(payload)
      }
      onSaved && onSaved()
    } catch (err) { setError(err.message || 'Failed to save event'); console.error(err) }
    finally { setSaving(false) }
  }

  return (
    <ModalShell
      title={mode === 'edit' ? 'Edit Event' : 'Create Event'}
      onClose={onClose}
      footer={<>
        <button className="eh-btn" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="eh-btn eh-btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : (mode === 'edit' ? 'Save Changes' : 'Create Event')}</button>
      </>}
    >
      {error && <div style={{ marginBottom: 14, padding: '11px 14px', borderRadius: 10, background: 'var(--eh-danger-soft)', color: 'var(--eh-danger)', fontSize: 13, fontWeight: 500 }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ gridColumn: '1 / -1' }}><label style={LABEL}>Event Name *</label><input style={FIELD} name="name" value={form.name} onChange={change} placeholder="e.g. Ganpati Celebration" /></div>
        <div><label style={LABEL}>NGO *</label>
          <Select value={form.ngo_id} onChange={(e) => change({ target: { name: 'ngo_id', value: e.target.value } })}>
            <option value="">Select NGO</option>
            {ngos.map(n => <option key={n.id} value={n.id}>{n.name || n.code}</option>)}
          </Select>
        </div>
        <div><label style={LABEL}>Sector *</label>
          <Select value={form.sector_id} onChange={(e) => change({ target: { name: 'sector_id', value: e.target.value } })} disabled={!ngoId}>
            <option value="">{ngoId ? 'Select sector' : 'Select NGO first'}</option>
            {sectorOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={LABEL}>Activities * (multi-select)</label>
        {!sectorId ? (
          <div style={{ fontSize: 12, color: 'var(--eh-ink-faint)' }}>Select a sector first to load its activities.</div>
        ) : activityOptions.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--eh-warn)' }}>No activities under this NGO + sector yet. Add one from the Activities page first.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 8 }}>
            {activityOptions.map(a => {
              const on = form.activities.includes(String(a.id))
              return (
                <label key={a.id} onClick={() => toggleActivity(a.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, border: on ? '1px solid var(--eh-primary)' : '1px solid var(--eh-line)', background: on ? 'var(--eh-tint-1)' : '#fff', cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={on} readOnly style={{ accentColor: 'var(--eh-primary)' }} />
                  <span>{a.name}</span>
                </label>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 14 }}>
        <div><label style={LABEL}>Date *</label><input type="date" style={FIELD} name="date" value={form.date} onChange={change} /></div>
        <div><label style={LABEL}>Start Time</label><input type="time" style={FIELD} name="start_time" value={form.start_time} onChange={change} /></div>
        <div><label style={LABEL}>End Time</label><input type="time" style={FIELD} name="end_time" value={form.end_time} onChange={change} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
        <div><label style={LABEL}>Status</label>
          <Select value={form.status} onChange={(e) => change({ target: { name: 'status', value: e.target.value } })}>
            {STATUS_PRIORITY.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        <div><label style={LABEL}>Priority</label>
          <Select value={form.priority} onChange={(e) => change({ target: { name: 'priority', value: e.target.value } })}>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </Select>
        </div>
      </div>
      <div style={{ marginTop: 14 }}><label style={LABEL}>Location / Venue</label><input style={FIELD} name="venue" value={form.venue} onChange={change} placeholder="Venue / address" /></div>
      <div style={{ marginTop: 14 }}><label style={LABEL}>Description</label><textarea style={{ ...FIELD, minHeight: 72, resize: 'vertical' }} name="description" value={form.description} onChange={change} placeholder="Event description / notes" /></div>
    </ModalShell>
  )
}

/* ── Event detail / quick actions ── */
function EventInfoModal({ event, onClose, onEdit, onDelete }) {
  const navigate = useNavigate()
  const p = event?.extendedProps || {}
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState('')

  const doDelete = async () => {
    setDeleting(true); setErr('')
    try { await deleteEvent(event.id); onDelete && onDelete() }
    catch (e) { setErr(e.message || 'Failed to delete'); setDeleting(false) }
  }

  if (!event) return null
  const timeRange = `${fmtTime(p.startTime) || '—'}${p.endTime ? ' – ' + fmtTime(p.endTime) : ''}`
  return (
    <ModalShell
      title={event.title || 'Event'}
      onClose={onClose}
      footer={<>
        {err && <span style={{ fontSize: 12, color: 'var(--eh-danger)', marginRight: 'auto' }}>{err}</span>}
        {!confirmDel && <>
          <button className="eh-btn" style={{ color: 'var(--eh-danger)', borderColor: 'var(--eh-danger)' }} onClick={() => setConfirmDel(true)}>Delete</button>
          <button className="eh-btn" onClick={onEdit}>Edit Event</button>
          <button className="eh-btn eh-btn-primary" onClick={() => navigate('/event-head/events/' + event.id)}>View Event</button>
          <button className="eh-btn" onClick={() => navigate('/event-head/media-management?event=' + event.id)}>Manage Media / Banners</button>
        </>}
        {confirmDel && <>
          <span style={{ fontSize: 13, color: 'var(--eh-ink)', marginRight: 'auto' }}>Delete this event permanently?</span>
          <button className="eh-btn" onClick={() => setConfirmDel(false)} disabled={deleting}>Cancel</button>
          <button className="eh-btn eh-btn-primary" style={{ background: 'var(--eh-danger)', borderColor: 'var(--eh-danger)' }} onClick={doDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Confirm Delete'}</button>
        </>}
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {p.ngoName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,var(--eh-primary),var(--eh-secondary))', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{(p.ngoName||'')[0]}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--eh-ink)' }}>{p.ngoName}</div>
              {p.sectorName && <div style={{ fontSize: 12, color: 'var(--eh-ink-soft)' }}>Sector: {p.sectorName}</div>}
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
          <div><div style={{ color: 'var(--eh-ink-faint)', fontSize: 11 }}>Date</div><b>{ymdToLabel(p.date)}</b></div>
          <div><div style={{ color: 'var(--eh-ink-faint)', fontSize: 11 }}>Time</div><b>{timeRange}</b></div>
        </div>
        {p.activities && p.activities.length > 0 && (
          <div>
            <div style={{ color: 'var(--eh-ink-faint)', fontSize: 11, marginBottom: 4 }}>Activities</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {p.activities.map(a => (
                <span key={a.id} style={{ padding: '4px 10px', borderRadius: 14, background: 'var(--eh-tint-1)', color: 'var(--eh-primary)', fontSize: 12, fontWeight: 600 }}>✓ {a.name}</span>
              ))}
            </div>
          </div>
        )}
        {(p.status || p.priority) && (
          <div style={{ display: 'flex', gap: 8 }}>
            {p.status && <span style={{ padding: '4px 10px', borderRadius: 12, background: 'var(--eh-tint-2)', fontSize: 12, fontWeight: 600, color: 'var(--eh-ink)' }}>{p.status}</span>}
            {p.priority && <span style={{ padding: '4px 10px', borderRadius: 12, background: 'var(--eh-tint-2)', fontSize: 12, fontWeight: 600, color: 'var(--eh-ink)' }}>Priority: {p.priority}</span>}
          </div>
        )}
        {p.venue && <div style={{ fontSize: 13 }}><span style={{ color: 'var(--eh-ink-faint)' }}>Location: </span>{p.venue}</div>}
        {p.description && <div style={{ fontSize: 13, lineHeight: 1.55, background: 'var(--eh-tint-1)', padding: '12px 14px', borderRadius: 12 }}>{p.description}</div>}
      </div>
    </ModalShell>
  )
}

export default function MonthlyPlanner() {
  const navigate = useNavigate()
  const calRef = useRef(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadKey, setLoadKey] = useState(0)

  const [range, setRange] = useState(null)
  /* Filters */
  const [search, setSearch] = useState('')
  const [filterNgo, setFilterNgo] = useState('')
  const [filterSector, setFilterSector] = useState('')
  const [filterActivity, setFilterActivity] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterYear, setFilterYear] = useState('')

  const [ngos, setNgos] = useState([])
  const [sectors, setSectors] = useState([])
  const [activities, setActivities] = useState([])

  /* Modals */
  const [createOpen, setCreateOpen] = useState(false)
  const [createDate, setCreateDate] = useState(null)
  const [selected, setSelected] = useState(null)
  const [editOpen, setEditOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [groupSel, setGroupSel] = useState(null)

  /* Load options (NGO → Sector → Activity cascade) */
  useEffect(() => {
    fetchWorkspaceNgos().catch(() => []).then(n => setNgos(n || []))
  }, [])
  useEffect(() => {
    if (!filterNgo) { setSectors([]); setActivities([]); return }
    fetchSectors({ ngo_id: filterNgo }).catch(() => []).then(s => setSectors(s || []))
    if (!filterSector) setActivities([])
  }, [filterNgo])
  useEffect(() => {
    if (!filterNgo || !filterSector) { setActivities([]); return }
    fetchActivities({ ngo_id: filterNgo, sector_id: filterSector }).catch(() => []).then(a => setActivities(a || []))
  }, [filterNgo, filterSector])

  /* Fetch visible-range events when range/filters change */
  const loadEvents = () => {
    if (!range) return
    setLoading(true)
    fetchCalendarEvents({
      start: range.startStr, end: range.endStr,
      ngoId: filterNgo || undefined, sectorId: filterSector || undefined,
      activityId: filterActivity || undefined, status: filterStatus || undefined,
      year: filterYear || undefined,
    }).then(d => setEvents(Array.isArray(d) ? d : []))
      .catch(err => { console.error('cal fetch', err); setEvents([]) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadEvents() /* eslint-disable-line */ }, [range, filterNgo, filterSector, filterActivity, filterStatus, filterYear, loadKey])

  const clearFilters = () => { setSearch(''); setFilterNgo(''); setFilterSector(''); setFilterActivity(''); setFilterStatus(''); setFilterYear('') }
  const hasFilters = search || filterNgo || filterSector || filterActivity || filterStatus || filterYear

  const changeNgo = (v) => { setFilterNgo(v); setFilterSector(''); setFilterActivity('') }
  const changeSector = (v) => { setFilterSector(v); setFilterActivity('') }

  const refresh = () => setLoadKey(k => k + 1)
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2600) }

  /* Filters applied post-fetch (search + delegated UI) */
  const filteredEvents = useMemo(() => {
    if (!search) return events
    const q = search.toLowerCase()
    return events.filter(ev => {
      const p = ev.extendedProps || {}
      const hay = [ev.title, p.ngoName, p.sectorName, p.status, p.priority, (p.activities || []).map(a => a.name).join(' '), p.venue]
        .filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [events, search])

  /* Group same-titled events across NGOs into one pill per day */
  const groupedEvents = useMemo(() => {
    return groupCalendarEvents(filteredEvents).map((g) => {
      const p = g.raw.extendedProps || {}
      const hasTime = Boolean(p.startTime || p.endTime)
      const cat = CATEGORY_META[g.category] || CATEGORY_META.other
      return {
        id: g.raw.id,
        title: g.baseTitle,
        start: hasTime ? `${g.date}T${(p.startTime || '00:00').slice(0, 5)}` : g.date,
        end: hasTime ? `${g.date}T${(p.endTime || '00:00').slice(0, 5)}` : g.date,
        allDay: !hasTime,
        editable: g.members.length === 1,
        extendedProps: {
          ...p,
          category: g.category,
          categoryColor: cat.color,
          categoryIcon: cat.icon,
          ngos: [...new Set(g.members.map(m => ngoCode(m.extendedProps?.ngoName)))],
          members: g.members,
        },
      }
    })
  }, [filteredEvents])

  const applyFilterToCal = () => {} // eslint-disable-line

  const handleDateSelect = (info) => {
    setCreateDate(info.startStr.slice(0, 10))
    setCreateOpen(true)
  }

  const handleEventClick = (info) => {
    const members = info.event.extendedProps?.members
    if (Array.isArray(members) && members.length > 1) {
      setGroupSel({ title: baseTitle(info.event.title, info.event.extendedProps?.ngoName), date: (info.event.extendedProps?.date || info.event.startStr || '').slice(0, 10), members })
      return
    }
    setSelected(info.event)
  }

  const handleEventDrop = async (info) => {
    const ev = info.event
    const members = ev.extendedProps?.members
    if (Array.isArray(members) && members.length > 1) {
      info.revert()
      showToast('This is a grouped event across NGOs — open it and edit each NGO separately.')
      return
    }
    const newDate = info.allDay ? toYmd(info.start) : ev.startStr.slice(0, 10)
    const label = ymdToLabel(newDate)
    const ok = window.confirm(`Move this event to ${label}?`)
    if (!ok) { info.revert(); return }
    try {
      const payload = { date: newDate }
      if (!info.allDay && ev.extendedProps) {
        payload.start_time = ev.extendedProps.startTime || null
        payload.end_time = ev.extendedProps.endTime || null
      }
      await updateEvent(ev.id, payload)
      refresh()
      showToast('Event moved successfully.')
    } catch (err) {
      info.revert()
      showToast('Could not move event: ' + (err.message || 'error'))
    }
  }

  const handleEventResize = async (info) => {
    const ev = info.event
    const members = ev.extendedProps?.members
    if (Array.isArray(members) && members.length > 1) {
      info.revert()
      showToast('This is a grouped event across NGOs — open it and edit each NGO separately.')
      return
    }
    const startTime = ev.startStr ? ev.startStr.slice(11, 16) : null
    const endTime = ev.endStr ? ev.endStr.slice(11, 16) : null
    try {
      await updateEvent(ev.id, { start_time: startTime || null, end_time: endTime || null, date: toYmd(ev.start) })
      refresh()
      showToast('Event updated successfully.')
    } catch (err) {
      info.revert()
      showToast('Could not update event: ' + (err.message || 'error'))
    }
  }

  const FilterBar = (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="card-pad" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 200px' }}><label style={LABEL}>Search Events</label><SearchInput value={search} onChange={setSearch} placeholder="Search events, NGO, activity…" /></div>
        <div style={{ width: 170 }}><label style={LABEL}>NGO</label>
          <Select value={filterNgo} onChange={(e) => changeNgo(e.target.value)}><option value="">All NGOs</option>{ngos.map(n => <option key={n.id} value={n.id}>{n.name || n.code}</option>)}</Select>
        </div>
        <div style={{ width: 210 }}><label style={LABEL}>Sector</label>
          <Select value={filterSector} onChange={(e) => changeSector(e.target.value)} disabled={!filterNgo}><option value="">{filterNgo ? 'All sectors' : 'Select NGO first'}</option>{sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        </div>
        <div style={{ width: 200 }}><label style={LABEL}>Activity</label>
          <Select value={filterActivity} onChange={(e) => setFilterActivity(e.target.value)} disabled={!filterNgo || !filterSector}><option value="">{filterSector ? 'All activities' : 'Select sector first'}</option>{activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        </div>
        <div style={{ width: 150 }}><label style={LABEL}>Status</label>
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}><option value="">All</option>{STATUS_PRIORITY.map(s => <option key={s} value={s}>{s}</option>)}</Select>
        </div>
        <div style={{ width: 110 }}><label style={LABEL}>Year</label>
          <Select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}><option value="">All</option>{[2026,2025,2024,2023,2022].map(y => <option key={y} value={y}>{y}</option>)}</Select>
        </div>
        <div>
          <button className="eh-btn" onClick={clearFilters} disabled={!hasFilters}>Clear</button>
        </div>
      </div>
    </div>
  )

  const today = new Date()
  const currentLabel = range
    ? `${MONTHS[range.start.getMonth()]} ${range.start.getFullYear()}`
    : `${MONTHS[today.getMonth()]} ${today.getFullYear()}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Calendar"
        subtitle={`Live interactive calendar · ${currentLabel}`}
        actions={<button className="eh-btn eh-btn-primary" onClick={() => { setCreateDate(null); setCreateOpen(true) }}>+ Create Event</button>}
      />

      {FilterBar}

      {toast && <div style={{ padding: '11px 16px', borderRadius: 12, background: 'var(--eh-success-soft)', color: 'var(--eh-success)', fontSize: 13, fontWeight: 600 }}>{toast}</div>}

      <div className="card" style={{ marginBottom: 0 }}>
        <div className="card-pad" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--eh-ink-soft)' }}>Legend</span>
          {Object.entries(CATEGORY_META).map(([k, m]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--eh-ink)' }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: m.color, display: 'inline-block' }} />
              {m.icon} {m.label}
            </span>
          ))}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--eh-ink)' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#e5e7eb', border: '1px solid #d1d5db', display: 'inline-block' }} />
            NGO tags (lighter)
          </span>
        </div>
      </div>

      <div className="card">
        <div className="card-pad">
          {loading && <div style={{ fontSize: 12, color: 'var(--eh-ink-faint)', marginBottom: 8 }}>Loading calendar…</div>}
          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,listMonth',
            }}
            height="auto"
            editable
            selectable
            selectMirror
            dayMaxEvents={3}
            moreLinkContent={(arg) => `${arg.num} more`}
            nowIndicator
            events={groupedEvents}
            eventClassNames={(arg) => {
              const p = arg.event.extendedProps || {}
              return ['ev-status-' + (p.status || ''), 'ev-cat-' + (p.category || 'other')].filter(Boolean)
            }}
            eventContent={(arg) => {
              const p = arg.event.extendedProps || {}
              const cat = CATEGORY_META[p.category] || CATEGORY_META.other
              const ngos = p.ngos || []
              const title = baseTitle(arg.event.title, p.ngoName)
              return {
                html: `<div class="eh-pill" style="--pile-c:${cat.color}">
                  <div class="eh-pill-row1"><span class="eh-pill-icon">${cat.icon}</span><span class="eh-pill-title">${escapeHtml(title)}${ngos.length > 1 ? ` <b class="eh-pill-count">(${ngos.length} NGOs)</b>` : ''}</span></div>
                  <div class="eh-pill-ngos">${ngos.map(n => `<span class="eh-tag">${escapeHtml(n)}</span>`).join('')}</div>
                </div>`,
              }
            }}
            datesSet={(info) => setRange(info)}
            dateClick={(info) => { setCreateDate(info.dateStr); setCreateOpen(true) }}
            select={handleDateSelect}
            eventClick={handleEventClick}
            eventDrop={handleEventDrop}
            eventResize={handleEventResize}
          />
        </div>
      </div>

      {createOpen && (
        <EventFormModal
          mode="create"
          initial={null}
          defaultDate={createDate || undefined}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); refresh(); showToast('Event created successfully.'); }}
        />
      )}
      {selected && !editOpen && (
        <EventInfoModal
          event={selected}
          onClose={() => setSelected(null)}
          onEdit={() => setEditOpen(true)}
          onDelete={() => { setSelected(null); refresh(); showToast('Event deleted.') }}
        />
      )}
      {editOpen && selected && (
        <EventFormModal
          mode="edit"
          initial={selected}
          defaultDate={undefined}
          onClose={() => { setEditOpen(false); setSelected(null) }}
          onSaved={() => { setEditOpen(false); setSelected(null); refresh(); showToast('Event updated successfully.') }}
        />
      )}
      {groupSel && (
        <ModalShell title={groupSel.title || 'Events'} onClose={() => setGroupSel(null)}>
          <div style={{ fontSize: 13, color: 'var(--eh-ink-soft)', marginBottom: 12 }}>
            {groupSel.members.length} events on {ymdToLabel(groupSel.date)} across different NGOs.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groupSel.members.map((ev) => {
              const p = ev.extendedProps || {}
              return (
                <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--eh-line)', borderRadius: 12, padding: '10px 12px' }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,var(--eh-primary),var(--eh-secondary))', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{(p.ngoName || '')[0]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--eh-ink)' }}>{p.ngoName || 'NGO'}</div>
                    <div style={{ fontSize: 12, color: 'var(--eh-ink-soft)' }}>{p.status || '—'}{p.sectorName ? ` · ${p.sectorName}` : ''}</div>
                  </div>
                  <button className="eh-btn eh-btn-sm" onClick={() => navigate('/event-head/events/' + ev.id)}>View</button>
                </div>
              )
            })}
          </div>
        </ModalShell>
      )}
    </div>
  )
}
