import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchWorkspaceNgos, fetchSectors, fetchActivities, fetchEvents, fetchEventById, fetchMedia, uploadMedia, replaceMedia, updateMedia, deleteMedia } from '../store'
import { useUcs } from '../../../store'
import { EnhancedTable } from '../components/Table'
import EditBannerModal from '../components/EditBannerModal'

const MEDIA_TYPES = ['Banner', 'Photo', 'Video', 'Document', 'Other']
const TYPE_COLORS = {
  Banner: '#7B5EA7',
  Photo: '#3485D4',
  Video: '#B5603A',
  Document: '#5B6B4E',
  Other: '#C08A2E',
}
const TABS = [
  { id: 'All', label: 'All' },
  { id: 'Banner', label: 'Banners' },
  { id: 'Photo', label: 'Photos' },
  { id: 'Video', label: 'Videos' },
  { id: 'Document', label: 'Documents' },
]

const pad2 = (n) => String(n).padStart(2, '0')

// Freely derive a media category from mimetype/url so old rows (mimetype
// only) still group into tabs. Banner is the explicit choice from uploads.
function categoryFromMedia(m) {
  if (m.media_type) return m.media_type
  const t = String(m.type || '').toLowerCase()
  const u = String(m.url || '').toLowerCase()
  if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/.test(u)) return 'Photo'
  if (t.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv)$/.test(u)) return 'Video'
  if (t.includes('pdf') || /\.pdf$/i.test(u)) return 'Document'
  if (/\.(docx?|xlsx?|pptx?|txt|csv)$/.test(u)) return 'Document'
  return 'Other'
}
const isImage = (m) => ['Banner', 'Photo'].includes(categoryFromMedia(m))
const isVideo = (m) => categoryFromMedia(m) === 'Video'
const isDocument = (m) => categoryFromMedia(m) === 'Document'
const extOf = (u = '') => (u.split('?')[0].match(/\.([a-z0-9]{1,5})$/i) || [])[1] || 'file'
const fmtBytes = (b) => {
  if (b == null || isNaN(b)) return '—'
  const n = Number(b)
  if (n >= 1073741824) return (n / 1073741824).toFixed(1) + ' GB'
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB'
  return n + ' B'
}
const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt)) return String(d).slice(0, 10)
  return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
const fmtDateLong = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt)) return String(d).slice(0, 10)
  return dt.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
const yearOf = (date) => {
  if (!date) return null
  const y = new Date(date)
  return isNaN(y) ? null : y.getFullYear()
}
const fmtTimeOf = (t) => {
  if (!t) return null
  const hm = String(t).slice(0, 5).split(':')
  let h = Number(hm[0]); const m = Number(hm[1])
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ap}`
}
const downloadUrl = (m) => {
  try {
    const a = document.createElement('a')
    a.href = m.url
    a.download = m.title || m.name || extOf(m.url)
    a.target = '_blank'
    a.rel = 'noreferrer'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } catch { window.open(m.url, '_blank') }
}

function StatBlock({ label, value, color }) {
  return (
    <div className="stat-card" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="stat-num" style={{ color }}>{value ?? 0}</div>
      <div className="stat-lbl">{label}</div>
    </div>
  )
}

export default function MediaManagement() {
  const navigate = useNavigate()
  const { user } = useUcs()
  const [searchParams, setSearchParams] = useSearchParams()

  // Options
  const [ngos, setNgos] = useState([])
  const [sectors, setSectors] = useState([])
  const [allEvents, setAllEvents] = useState([])

  // Filters (NGO → Sector → Event → Year)
  const [ngoFilter, setNgoFilter] = useState(searchParams.get('ngo') || '')
  const [sectorFilter, setSectorFilter] = useState(searchParams.get('sector') || '')
  const [eventFilter, setEventFilter] = useState(searchParams.get('event') || '')
  const [yearFilter, setYearFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('All')

  // Data
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [media, setMedia] = useState([])
  const [historyEvents, setHistoryEvents] = useState([])
  const [historyMedia, setHistoryMedia] = useState({})
  const [historyLoading, setHistoryLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingEvents, setLoadingEvents] = useState(false)

  // Modals
  const [showUpload, setShowUpload] = useState(false)
  const [uploadMode, setUploadMode] = useState('media') // 'media' | 'banner'
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null) // {done,total}
  const [uploadMsg, setUploadMsg] = useState('')
  const [uploadErr, setUploadErr] = useState('')
  const [draft, setDraft] = useState({ media_type: 'Photo', title: '', description: '' })
  const [files, setFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const uploadInput = useRef(null)
  const dragDepth = useRef(0)

  // Upload target selection (NGO → Sector → Activity → Event) — independent of filter bar
  const [uploadNgoId, setUploadNgoId] = useState('')
  const [uploadSectorId, setUploadSectorId] = useState('')
  const [uploadActivityId, setUploadActivityId] = useState('')
  const [uploadEventId, setUploadEventId] = useState('')
  const [upSectors, setUpSectors] = useState([])
  const [upActivities, setUpActivities] = useState([])
  const [upEvents, setUpEvents] = useState([])
  const upEventInfo = useMemo(() => upEvents.find(e => String(e.id) === String(uploadEventId)) || null, [upEvents, uploadEventId])

  const [previewItem, setPreviewItem] = useState(null)
  const [replaceItem, setReplaceItem] = useState(null)
  const [replaceFile, setReplaceFile] = useState(null)
  const [replaceTitle, setReplaceTitle] = useState('')
  const [replaceDesc, setReplaceDesc] = useState('')
  const [replacing, setReplacing] = useState(false)
  const replaceInput = useRef(null)
  const [editBanner, setEditBanner] = useState(null) // { media, event }
  const openEdit = (m, ev) => setEditBanner({ media: m, event: ev || selectedEvent })
  const loadMedia = (id) => fetchMedia(id).then(med => setMedia(med || [])).catch(() => {})

  /* ── Load NGOs ── */
  useEffect(() => {
    let cancelled = false
    fetchWorkspaceNgos().then(d => { if (!cancelled) setNgos(d || []) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  /* ── Load sectors for selected NGO ── */
  useEffect(() => {
    let cancelled = false
    setSectors([])
    fetchSectors({ ngo_id: ngoFilter || undefined })
      .then(d => { if (!cancelled) setSectors(d || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [ngoFilter])

  /* ── Load events for selected NGO/Sector ── */
  useEffect(() => {
    let cancelled = false
    setLoadingEvents(true)
    fetchEvents({ ngo_id: ngoFilter || undefined, sector_id: sectorFilter || undefined })
      .then(d => { if (!cancelled) setAllEvents(d || []) })
      .catch(() => { if (!cancelled) setAllEvents([]) })
      .finally(() => { if (!cancelled) setLoadingEvents(false) })
    return () => { cancelled = true }
  }, [ngoFilter, sectorFilter])

  /* ── Upload modal: sectors for chosen NGO ── */
  useEffect(() => {
    let cancelled = false
    setUpSectors([])
    setUploadSectorId('')
    setUploadActivityId('')
    setUploadEventId('')
    setUpActivities([])
    setUpEvents([])
    if (!uploadNgoId) return () => {}
    fetchSectors({ ngo_id: uploadNgoId }).then(d => { if (!cancelled) setUpSectors(d || []) }).catch(() => {})
    return () => { cancelled = true }
  }, [uploadNgoId])

  /* ── Upload modal: activities for chosen NGO/Sector ── */
  useEffect(() => {
    let cancelled = false
    setUpActivities([])
    setUploadActivityId('')
    setUploadEventId('')
    setUpEvents([])
    if (!uploadNgoId || !uploadSectorId) return () => {}
    fetchActivities({ ngo_id: uploadNgoId, sector_id: uploadSectorId }).then(d => { if (!cancelled) setUpActivities(d || []) }).catch(() => {})
    return () => { cancelled = true }
  }, [uploadNgoId, uploadSectorId])

  /* ── Upload modal: events for chosen NGO/Sector/Activity ── */
  useEffect(() => {
    let cancelled = false
    setUpEvents([])
    setUploadEventId('')
    if (!uploadNgoId || !uploadSectorId || !uploadActivityId) return () => {}
    fetchEvents({ ngo_id: uploadNgoId, sector_id: uploadSectorId, activity_id: uploadActivityId }).then(d => { if (!cancelled) setUpEvents(d || []) }).catch(() => {})
    return () => { cancelled = true }
  }, [uploadNgoId, uploadSectorId, uploadActivityId])

  /* ── Upload modal: select the event, watch its year to enrich the upload ── */
  const uploadYear = upEventInfo?.date ? yearOf(upEventInfo.date) : null
  useEffect(() => {
    setUploadMsg('')
    setUploadErr('')
  }, [uploadEventId])

  /* ── Load selected event detail + media + history ── */
  useEffect(() => {
    if (!eventFilter) { setSelectedEvent(null); setMedia([]); setHistoryEvents([]); setHistoryMedia({}); return }
    let cancelled = false
    setLoading(true)
    setSelectedEvent(null)
    Promise.all([fetchEventById(eventFilter).catch(() => null), fetchMedia(eventFilter).catch(() => [])])
      .then(([ev, med]) => {
        if (cancelled) return
        setSelectedEvent(ev || null)
        setMedia(med || [])
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [eventFilter])

  /* ── History: recurring years for the same program (same activity) ── */
  useEffect(() => {
    if (!selectedEvent) { setHistoryEvents([]); setHistoryMedia({}); return }
    let cancelled = false
    const actId = selectedEvent.activity_id
    const sameName = (e) => String(e.name || '').toLowerCase() === String(selectedEvent.name || '').toLowerCase()
    const related = allEvents.filter(e => (actId != null && String(e.activity_id) === String(actId)) || sameName(e))
    setHistoryEvents(related)
    setHistoryLoading(true)
    Promise.all(related.map(e => fetchMedia(e.id).catch(() => []))).then(results => {
      if (cancelled) return
      const map = {}
      related.forEach((e, i) => { map[String(e.id)] = results[i] || [] })
      setHistoryMedia(map)
    }).catch(() => {}).finally(() => { if (!cancelled) setHistoryLoading(false) })
    return () => { cancelled = true }
  }, [selectedEvent, allEvents])

  /* ── Filter change handlers preserving URL state for NGO/Sector/Event ── */
  const onNgo = (v) => { setNgoFilter(v); setSectorFilter(''); setEventFilter(''); setTab('All'); syncParams({ ngo: v, sector: '', event: '' }) }
  const onSector = (v) => { setSectorFilter(v); setEventFilter(''); setTab('All'); syncParams({ sector: v, event: '' }) }
  const onEvent = (v) => { setEventFilter(v); setTab('All'); syncParams({ event: v }) }
  const syncParams = (patch) => {
    const next = { ...Object.fromEntries(searchParams), ...patch }
    const clean = {}
    for (const k of Object.keys(next)) if (next[k] && next[k] !== '') clean[k] = next[k]
    setSearchParams(clean, { replace: true })
  }

  /* ── Derived filters ── */
  const eventYear = yearOf(selectedEvent?.date)

  // Places to put new uploads
  const ngoNameOf = (ev) => ev?.ngo_name || (ev?.ngo_id != null ? (ngos.find(n => String(n.id) === String(ev.ngo_id))?.name || '—') : '—')
  const sectorNameOf = (ev) => ev?.sector_name || (ev?.sector_id != null ? (sectors.find(s => String(s.id) === String(ev.sector_id))?.name || '—') : '—')

  // Number of distinct activities across the selected event + its recurring history
  const activityCount = useMemo(() => {
    if (!selectedEvent) return 0
    const ids = new Set([selectedEvent.activity_id].concat(historyEvents.map(e => e.activity_id)).filter(a => a != null && a !== ''))
    return ids.size
  }, [selectedEvent, historyEvents])

  const relatedYears = useMemo(() => {
    const set = new Set()
    if (eventYear != null) set.add(eventYear)
    if (eventFilter) for (const e of allEvents) { const y = yearOf(e.date); if (y != null) set.add(y) }
    return [...set].sort((a, b) => b - a)
  }, [allEvents, eventFilter, eventYear])

  /* ── Filtered media for the current view ── */
  const filteredMedia = useMemo(() => {
    let list = media
    if (tab !== 'All') list = list.filter(m => categoryFromMedia(m) === tab)
    if (typeFilter) list = list.filter(m => categoryFromMedia(m) === typeFilter)
    if (yearFilter) list = list.filter(m => (m.year != null ? String(m.year) : String(eventYear ?? '')) === String(yearFilter))
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(m => {
        const e = selectedEvent || {}
        return [m.title, m.name, extOf(m.url), e.name, e.ngo_name, e.sector_name, m.year, eventYear, m.uploaded_by]
          .some(v => v != null && String(v).toLowerCase().includes(q))
      })
    }
    return list
  }, [media, tab, typeFilter, yearFilter, search, eventYear, selectedEvent])

  const counts = useMemo(() => {
    const c = { All: media.length, Banner: 0, Photo: 0, Video: 0, Document: 0 }
    for (const m of media) c[categoryFromMedia(m)] = (c[categoryFromMedia(m)] || 0) + 1
    return c
  }, [media])

  const summaryStats = [
    { label: 'Total Media', value: media.length, type: 'All' },
    { label: 'Banners', value: counts.Banner, type: 'Banner' },
    { label: 'Photos', value: counts.Photo, type: 'Photo' },
    { label: 'Videos', value: counts.Video, type: 'Video' },
    { label: 'Documents', value: counts.Document, type: 'Document' },
  ]

  /* ── Upload handlers ── */
  const openUpload = (mode) => {
    setUploadMode(mode)
    setDraft({ media_type: mode === 'banner' ? 'Banner' : 'Photo', title: '', description: '' })
    setFiles([])
    setUploadMsg('')
    setUploadErr('')
    setUploadProgress(null)
    // Prefill the NGO from the current filter; Sector/Activity/Event load
    // dynamically as the user picks through the chain.
    setUploadNgoId(ngoFilter || '')
    setUploadSectorId('')
    setUploadActivityId('')
    setUploadEventId('')
    setShowUpload(true)
  }

  const onPickFiles = (list) => {
    const arr = Array.from(list || [])
    if (!arr.length) return
    setFiles(prev => {
      const seen = new Set(prev.map(f => f.name + '_' + f.size))
      const next = [...prev]
      for (const f of arr) { const k = f.name + '_' + f.size; if (!seen.has(k)) { seen.add(k); next.push(f) } }
      return next
    })
  }
  const removeFile = (idx) => setFiles(files.filter((_, i) => i !== idx))

  const onDrop = (e) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    onPickFiles(e.dataTransfer?.files)
  }

  const buildFormData = (targetFiles) => {
    const fd = new FormData()
    for (const f of targetFiles) fd.append('files', f, f.name)
    if (draft.title) fd.append('title', draft.title)
    if (draft.description) fd.append('description', draft.description)
    if (draft.media_type) fd.append('media_type', draft.media_type)
    if (uploadYear != null) fd.append('year', uploadYear)
    if (user?.name) fd.append('uploaded_by', user.name)
    return fd
  }

  const handleUpload = async () => {
    if (!uploadEventId) { setUploadErr('Select an event from the drop-downs above first.'); return }
    if (files.length === 0) { setUploadErr('Choose at least one file.'); return }
    setUploading(true); setUploadMsg(''); setUploadErr(''); setUploadProgress({ done: 0, total: files.length })
    try {
      const fd = buildFormData(files)
      const res = await uploadMedia(uploadEventId, fd)
      const added = Array.isArray(res) ? res : [res]
      if (added.length && String(uploadEventId) === String(eventFilter)) setMedia(prev => [...added.reverse(), ...prev])
      setUploadMsg(`Media uploaded successfully. ${added.length} file${added.length > 1 ? 's' : ''} added.`)
      setFiles([])
      setUploadProgress({ done: added.length, total: added.length })
      // refresh history counts for this year
      setHistoryEvents(prev => [...prev])
    } catch (err) {
      setUploadErr(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  /* ── Replace ── */
  const openReplace = (m) => {
    setReplaceItem(m)
    setReplaceFile(null)
    setReplaceTitle(m.title || m.name || '')
    setReplaceDesc(m.description || '')
    if (replaceInput.current) replaceInput.current.value = ''
  }
  const handleReplace = async () => {
    if (!replaceItem) return
    setReplacing(true)
    try {
      const fd = new FormData()
      if (replaceTitle) fd.append('title', replaceTitle)
      if (replaceDesc) fd.append('description', replaceDesc)
      if (replaceFile) {
        fd.append('file', replaceFile, replaceFile.name)
        fd.append('media_type', categoryFromMedia(replaceItem))
      }
      const res = await replaceMedia(eventFilter, replaceItem.id, fd)
      setMedia(prev => prev.map(m => m.id === res.id ? { ...m, ...res } : m))
      setReplaceItem(null)
    } catch (err) {
      alert('Replace failed: ' + (err.message || 'Unknown error'))
    } finally { setReplacing(false) }
  }

  /* ── Edit metadata ── */
  const editTitle = (m) => {
    // Open the shared Edit Banner modal (metadata edit, no re-upload required).
    openEdit(m, selectedEvent)
  }

  /* ── Delete ── */
  const handleDelete = async (m) => {
    if (!confirm(`Delete "${m.title || m.name || 'this media'}"?`)) return
    try {
      await deleteMedia(eventFilter, m.id)
      setMedia(prev => prev.filter(x => x.id !== m.id))
    } catch (e) { alert('Delete failed: ' + (e.message || 'Unknown error')) }
  }

  const selectHistoryYear = (y) => {
    setYearFilter(String(y))
    if (tab !== 'All') setTab('All')
    window.scrollTo({ top: 300, behavior: 'smooth' })
  }

  /* ── Table columns ── */
  const tableColumns = [
    {
      header: 'Preview',
      accessor: 'url',
      render: (m) => (
        <button
          className="btn btn-sm btn-icon"
          style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', padding: 0, border: '1px solid var(--line)', background: '#eceef0' }}
          onClick={() => setPreviewItem(m)} title="Preview"
        >
          {isImage(m)
            ? <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none' }} />
            : <span style={{ fontSize: 18 }}>{isVideo(m) ? '🎬' : isDocument(m) ? '📄' : '📁'}</span>}
        </button>
      ),
    },
    { header: 'File Name', accessor: 'name', render: (m) => <span style={{ fontWeight: 500 }}>{m.title || m.name}</span> },
    { header: 'Type', accessor: 'media_type', render: (m) => { const c = categoryFromMedia(m); return <span className="pill" style={{ background: `${TYPE_COLORS[c]}18`, color: TYPE_COLORS[c] }}>{c}</span> } },
    { header: 'Event', accessor: 'name', render: () => selectedEvent?.name || '—' },
    { header: 'NGO', render: () => ngoNameOf(selectedEvent) },
    { header: 'Sector', render: () => sectorNameOf(selectedEvent) },
    { header: 'Year', accessor: 'year', render: (m) => m.year || eventYear || '—' },
    { header: 'Size', accessor: 'size', render: (m) => fmtBytes(m.size) },
    { header: 'Uploaded By', accessor: 'uploaded_by', render: (m) => m.uploaded_by || '—' },
    { header: 'Uploaded Date', accessor: 'created_at', render: (m) => fmtDate(m.created_at) },
    {
      header: 'Actions',
      render: (m) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => setPreviewItem(m)}>View</button>
          <button className="btn btn-sm" onClick={() => downloadUrl(m)}>Download</button>
          <button className="btn btn-sm" onClick={() => editTitle(m)}>Edit</button>
          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(m)}>Delete</button>
        </div>
      ),
    },
  ]

  const typePills = ['All', ...MEDIA_TYPES]

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 18 }}>Media / Banners</h3>
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>Manage event banners, photos, videos and historical campaign assets.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={() => openUpload('media')}>+ Upload Media</button>
          <button className="btn btn-sm" style={{ background: '#7B5EA7', borderColor: '#7B5EA7', color: '#fff' }} onClick={() => openUpload('banner')}>+ Upload Banner</button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card" style={{ marginTop: 14, marginBottom: 16 }}>
        <div className="card-pad" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div className="field" style={{ minWidth: 150, flex: '1 1 150px' }}>
            <label>NGO</label>
            <select value={ngoFilter} onChange={e => onNgo(e.target.value)}>
              <option value="">All NGOs</option>
              {ngos.map(n => <option key={String(n.id)} value={n.id}>{n.name || n.code}</option>)}
            </select>
          </div>
          <div className="field" style={{ minWidth: 180, flex: '1 1 180px' }}>
            <label>Sector</label>
            <select value={sectorFilter} onChange={e => onSector(e.target.value)} disabled={!ngoFilter && sectors.length === 0}>
              <option value="">All Sectors</option>
              {sectors.map(s => <option key={String(s.id)} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ minWidth: 180, flex: '1 1 180px' }}>
            <label>Event</label>
            <select value={eventFilter} onChange={e => onEvent(e.target.value)} disabled={loadingEvents}>
              <option value="">All Events</option>
              {allEvents.map(ev => <option key={String(ev.id)} value={ev.id}>{ev.name}{ev.date ? ` (${String(ev.date).slice(0, 7)})` : ''}</option>)}
            </select>
          </div>
          <div className="field" style={{ minWidth: 120, flex: '1 1 120px' }}>
            <label>Year</label>
            <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
              <option value="">All Years</option>
              {relatedYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="field" style={{ minWidth: 130, flex: '1 1 130px' }}>
            <label>Media Type</label>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">All</option>
              {MEDIA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="field" style={{ minWidth: 180, flex: '2 1 200px', position: 'relative' }}>
            <label>Search</label>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" style={{ position: 'absolute', right: 10, top: 31, pointerEvents: 'none' }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search media…" style={{ paddingRight: 32 }} />
          </div>
        </div>
      </div>

      {/* Event summary card */}
      {selectedEvent ? (
        <div className="card" style={{ marginBottom: 16, borderTop: `3px solid #7B5EA7` }}>
          <div className="card-pad" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
            <div style={{ flex: '1 1 260px', minWidth: 220 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#7B5EA7', marginBottom: 4 }}>{eventYear || '—'}</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{selectedEvent.name}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 }}>
                {ngoNameOf(selectedEvent)} · {sectorNameOf(selectedEvent)}
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink)', marginTop: 6 }}>{fmtDateLong(selectedEvent.date)}</div>
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#3485D4' }}>{activityCount}</div><div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Activities</div></div>
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#7B5EA7' }}>{media.length}</div><div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Media Files</div></div>
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#B5603A' }}>{new Set(historyEvents.map(e => yearOf(e.date)).filter(Boolean)).size}</div><div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Historical Years</div></div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" onClick={() => navigate('/event-head/events/' + selectedEvent.id)}>View Event</button>
              <button className="btn btn-sm" onClick={() => navigate('/event-head/activities/' + selectedEvent.activity_id)} disabled={!selectedEvent.activity_id}>Activity</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-pad" style={{ textAlign: 'center', padding: 32, color: 'var(--ink-soft)' }}>
            Select an NGO → Sector → Event to manage its media & banners.
          </div>
        </div>
      )}

      {selectedEvent && eventFilter && (
        <>
          {/* Media dashboard summary */}
          <div className="stats-grid" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(5, 1fr)' }}>
            {summaryStats.map(s => <StatBlock key={s.label} label={s.label} value={s.value} color={s.type === 'All' ? '#4F6472' : TYPE_COLORS[s.type]} />)}
          </div>

          {/* Media type tabs */}
          <div className="filter-bar" style={{ marginBottom: 16, padding: 6, gap: 4, background: 'var(--bg)' }}>
            {TABS.map(t => {
              const active = tab === t.id
              const n = t.id === 'All' ? media.length : counts[t.id] || 0
              return (
                <button key={t.id} className={`btn btn-sm ${active ? 'btn-primary' : ''}`} style={{ padding: '6px 14px' }} onClick={() => { setTab(t.id); setYearFilter(''); }}>
                  {t.label} <span style={{ opacity: .8 }}>({n})</span>
                </button>
              )
            })}
          </div>

          {/* Banner grid (visual) for Banner / All */}
          {(tab === 'All' || tab === 'Banner') && (() => {
            const banners = filteredMedia.filter(m => categoryFromMedia(m) === 'Banner')
            if (tab === 'All' && banners.length === 0) return null
            return (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-head"><h3>Banners</h3></div>
                <div className="card-pad">
                  {banners.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 28, color: 'var(--ink-soft)' }}>No banners yet.</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                      {banners.map(m => (
                        <div key={m.id} className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                          <div style={{ position: 'relative', height: 130, background: '#eceef0', overflow: 'hidden', cursor: 'pointer' }} onClick={() => setPreviewItem(m)}>
                            <img src={m.url} alt={m.title || m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none' }} />
                            <span className="pill" style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 11 }}>{m.year || eventYear || '—'}</span>
                          </div>
                          <div style={{ padding: 10 }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{m.title || m.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{selectedEvent.name} · {sectorNameOf(selectedEvent)}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{fmtDate(m.created_at)} · {fmtBytes(m.size)} · {categoryFromMedia(m)}</div>
                            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                              <button className="btn btn-sm" onClick={() => setPreviewItem(m)}>Preview</button>
                              <button className="btn btn-sm" style={{ background: '#7B5EA7', borderColor: '#7B5EA7', color: '#fff' }} onClick={() => openEdit(m, selectedEvent)}>Edit Banner</button>
                              <button className="btn btn-sm" onClick={() => openReplace(m)}>Replace</button>
                              <button className="btn btn-sm btn-danger" onClick={() => handleDelete(m)}>Delete</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* History */}
          {historyEvents.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-head"><h3>{String(selectedEvent.name || '').toUpperCase()} — HISTORY</h3></div>
              <div className="card-pad">
                {historyLoading ? <div className="loading">Loading history…</div> : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {historyEvents
                      .slice()
                      .sort((a, b) => yearOf(b.date) - yearOf(a.date))
                      .map(ev => {
                        const y = yearOf(ev.date)
                        const med = historyMedia[String(ev.id)] || []
                        const mainBanner = med.find(m => categoryFromMedia(m) === 'Banner') || null
                        const other = med.filter(m => categoryFromMedia(m) !== 'Banner')
                        const active = String(ev.id) === String(eventFilter)
                        const b = med.filter(m => categoryFromMedia(m) === 'Banner').length
                        const acts = Array.isArray(ev.activities) && ev.activities.length ? ev.activities : (ev.activity_name ? [{ id: ev.activity_id, name: ev.activity_name }] : [])
                        const timeRange = `${fmtTimeOf(ev.start_time) || '—'}${ev.end_time ? ' – ' + fmtTimeOf(ev.end_time) : ''}`
                        return (
                          <div key={ev.id} style={{ display: 'flex', gap: 14, padding: '12px 4px', borderBottom: '1px solid var(--line)' }}>
                            <div style={{ width: 70, flexShrink: 0, textAlign: 'center', paddingTop: 4 }}>
                              <div style={{ fontSize: 24, fontWeight: 800, color: active ? '#7B5EA7' : 'var(--ink)' }}>{y || '—'}</div>
                              <div style={{ fontSize: 10, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{active ? 'Current' : 'Past'}</div>
                            </div>
                            <div style={{ width: 150, height: 96, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: '#eceef0', border: '1px solid var(--line)', cursor: 'pointer' }}
                              onClick={() => mainBanner ? setPreviewItem(mainBanner) : undefined}
                              title={mainBanner ? 'Preview banner' : 'No banner'}>
                              {mainBanner && (categoryFromMedia(mainBanner) === 'Banner' || isImage(mainBanner))
                                ? <img src={mainBanner.url} alt={mainBanner.title || 'banner'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none' }} />
                                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-faint)', fontSize: 11 }}>No banner</div>}
                            </div>
                            <div style={{ flex: 1, minWidth: 200, fontSize: 13 }}>
                              <div style={{ fontWeight: 700 }}>{active ? ev.name : ev.name}</div>
                              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>{fmtDateLong(ev.date)} {timeRange && <span> · {timeRange}</span>}</div>
                              {acts.length > 0 && (
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                                  {acts.map(a => <span key={a.id} style={{ padding: '2px 8px', borderRadius: 12, background: 'var(--pill-bg, #efebfb)', color: '#7B5EA7', fontSize: 11, fontWeight: 600 }}>✓ {a.name}</span>)}
                                </div>
                              )}
                              <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 6 }}>{b} banner{b !== 1 ? 's' : ''} · {other.length} other media</div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start', flexShrink: 0 }}>
                              {mainBanner ? (
                                <button className="btn btn-sm" style={{ background: '#7B5EA7', borderColor: '#7B5EA7', color: '#fff' }} onClick={() => openEdit(mainBanner, ev)}>Edit Banner</button>
                              ) : (
                                <button className="btn btn-sm" onClick={() => active ? openUpload('banner') : null} disabled={!active}>Upload Banner</button>
                              )}
                              <button className="btn btn-sm" onClick={() => { if (!active) onEvent(String(ev.id)) }} disabled={active}>{active ? 'Current' : 'View Event'}</button>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Media table / list view */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ fontSize: 15 }}>All Media</h3>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                {filteredMedia.length} of {media.length} shown{yearFilter ? ` · year ${yearFilter}` : ''}{tab !== 'All' ? ` · ${tab}s` : ''}
              </div>
            </div>
            {typeFilter && <div style={{ fontSize: 12 }}>
              <span className="pill pill-purple">{typeFilter} <button style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4, color: 'inherit' }} onClick={() => setTypeFilter('')}>✕</button></span>
            </div>}
          </div>

          <EnhancedTable
            columns={tableColumns}
            data={filteredMedia}
            searchPlaceholder="Search in list…"
            pageSize={10}
          />
        </>
      )}

      {/* Upload modal */}
      {showUpload && (
        <div className="modal-overlay" onClick={() => { if (!uploading) setShowUpload(false) }}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{uploadMode === 'banner' ? 'Upload Banner' : 'Upload Media'}</h3>
              <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-soft)' }} onClick={() => { if (!uploading) setShowUpload(false) }}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 12 }}>Choose the NGO → Sector → Activity → Event the files belong to.</div>

              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="field"><label>NGO</label>
                  <select value={uploadNgoId} onChange={e => setUploadNgoId(e.target.value)}>
                    <option value="">Select NGO</option>
                    {ngos.map(n => <option key={String(n.id)} value={n.id}>{n.name || n.code}</option>)}
                  </select>
                </div>
                <div className="field"><label>Sector</label>
                  <select value={uploadSectorId} onChange={e => setUploadSectorId(e.target.value)} disabled={!uploadNgoId}>
                    <option value="">Select Sector</option>
                    {upSectors.map(s => <option key={String(s.id)} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="field"><label>Activity</label>
                  <select value={uploadActivityId} onChange={e => setUploadActivityId(e.target.value)} disabled={!uploadSectorId}>
                    <option value="">Select Activity</option>
                    {upActivities.map(a => <option key={String(a.id)} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="field"><label>Year</label><input value={uploadYear || ''} readOnly placeholder="Auto from event date" /></div>
              </div>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="field" style={{ flex: '1 1 100%' }}><label>Event</label>
                  <select value={uploadEventId} onChange={e => setUploadEventId(e.target.value)} disabled={!uploadActivityId}>
                    <option value="">Select Event</option>
                    {upEvents.map(ev => <option key={String(ev.id)} value={ev.id}>{ev.name}{ev.date ? ` (${String(ev.date).slice(0, 7)})` : ''}</option>)}
                  </select>
                </div>
              </div>
              {uploadEventId && !upEventInfo && (
                <div style={{ fontSize: 12, color: '#B5603A', marginBottom: 12 }}>Loading event… please wait.</div>
              )}
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="field"><label>Media Type</label>
                  <select value={draft.media_type} onChange={e => setDraft({ ...draft, media_type: e.target.value })}>
                    {MEDIA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="field"><label>Title</label><input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder={uploadMode === 'banner' ? 'e.g. Ganpati Main Banner' : 'e.g. Event group photo'} /></div>
              </div>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="field"><label>Description</label><textarea value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} rows={2} placeholder="Optional note" style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} /></div>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragEnter={e => { e.preventDefault(); dragDepth.current++ }}
                onDragLeave={e => { e.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragging(false) }}
                onDrop={onDrop}
                style={{ border: `2px dashed ${dragging ? 'var(--sage)' : 'var(--line)'}`, borderRadius: 'var(--radius-sm)', padding: 22, textAlign: 'center', background: dragging ? 'var(--sage-light, #f3f6ef)' : 'var(--bg)', transition: 'border-color .15s, background .15s' }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Drag &amp; drop files here</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '4px 0 12px' }}>or</div>
                <button className="btn btn-sm" type="button" onClick={() => uploadInput.current?.click()}>Browse Files</button>
                <input ref={uploadInput} type="file" multiple hidden onChange={e => { onPickFiles(e.target.files); e.target.value = '' }} accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" />
              </div>

              {files.length > 0 && (
                <div style={{ marginTop: 12, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{files.length} file{files.length > 1 ? 's' : ''} selected</div>
                  <div style={{ maxHeight: 140, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {files.map((f, i) => (
                      <div key={f.name + '_' + f.size} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        <span style={{ color: 'var(--ink-soft)' }}>{fmtBytes(f.size)}</span>
                        <button className="btn btn-sm btn-icon" onClick={() => removeFile(i)} title="Remove">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {uploadProgress && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>
                    {uploadProgress.done}/{uploadProgress.total} files uploaded
                  </div>
                  <div style={{ height: 8, borderRadius: 6, background: 'var(--line)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.round((uploadProgress.done / Math.max(1, uploadProgress.total)) * 100)}%`, background: 'var(--sage)', transition: 'width .3s' }} />
                  </div>
                </div>
              )}
              {uploadMsg && <div style={{ marginTop: 10, fontSize: 12, color: '#16a34a' }}>{uploadMsg}</div>}
              {uploadErr && <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>{uploadErr}</div>}
            </div>
            <div className="modal-actions" style={{ padding: '0 18px 18px' }}>
              <button className="btn btn-sm" onClick={() => setShowUpload(false)} disabled={uploading}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpload} disabled={uploading || files.length === 0}>
                {uploading ? 'Uploading…' : files.length > 1 ? `Upload All (${files.length})` : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewItem && (
        <div className="modal-overlay" onClick={() => setPreviewItem(null)} style={{ zIndex: 2100 }}>
          <div className="modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{previewItem.title || previewItem.name}</h3>
              <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-soft)' }} onClick={() => setPreviewItem(null)}>✕</button>
            </div>
            <div className="modal-body">
              {isImage(previewItem) ? (
                <div style={{ borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', maxHeight: 380 }}>
                  <img src={previewItem.url} alt={previewItem.title || previewItem.name} style={{ maxWidth: '100%', maxHeight: 380, objectFit: 'contain', display: 'block' }} onError={e => { e.currentTarget.style.display = 'none' }} />
                </div>
              ) : isVideo(previewItem) ? (
                <video src={previewItem.url} controls style={{ width: '100%', maxHeight: 380, borderRadius: 'var(--radius-sm)', background: '#000' }} />
              ) : (
                <div style={{ textAlign: 'center', padding: 30, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', background: 'var(--bg)' }}>
                  <div style={{ fontSize: 44 }}>{isDocument(previewItem) ? '📄' : '📁'}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>{previewItem.title || previewItem.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>{fmtBytes(previewItem.size)} · {categoryFromMedia(previewItem)}</div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, marginTop: 14 }}>
                <div><span style={{ color: 'var(--ink-soft)' }}>Event:</span> {selectedEvent?.name || '—'}</div>
                <div><span style={{ color: 'var(--ink-soft)' }}>Year:</span> {previewItem.year || eventYear || '—'}</div>
                <div><span style={{ color: 'var(--ink-soft)' }}>NGO:</span> {ngoNameOf(selectedEvent)}</div>
                <div><span style={{ color: 'var(--ink-soft)' }}>Sector:</span> {sectorNameOf(selectedEvent)}</div>
                <div><span style={{ color: 'var(--ink-soft)' }}>Uploaded:</span> {fmtDate(previewItem.created_at)}</div>
                <div><span style={{ color: 'var(--ink-soft)' }}>File:</span> {extOf(previewItem.url)} · {fmtBytes(previewItem.size)}</div>
              </div>
              {previewItem.description && <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 10 }}>{previewItem.description}</div>}
            </div>
            <div className="modal-actions" style={{ padding: '0 18px 18px' }}>
              <button className="btn btn-sm" onClick={() => setPreviewItem(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => downloadUrl(previewItem)}>Download</button>
            </div>
          </div>
        </div>
      )}

      {/* Replace modal */}
      {replaceItem && (        <div className="modal-overlay" onClick={() => { if (!replacing) setReplaceItem(null) }}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Replace Banner / Media</h3>
              <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-soft)' }} onClick={() => { if (!replacing) setReplaceItem(null) }}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 10 }}>Replacing: <b>{replaceItem.title || replaceItem.name}</b></div>
              <div className="form-row" style={{ marginBottom: 10 }}>
                <div className="field"><label>Title</label><input value={replaceTitle} onChange={e => setReplaceTitle(e.target.value)} /></div>
              </div>
              <div className="form-row" style={{ marginBottom: 10 }}>
                <div className="field"><label>Description</label><textarea value={replaceDesc} onChange={e => setReplaceDesc(e.target.value)} rows={2} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} /></div>
              </div>
              <div className="field">
                <label>New File (optional)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn btn-sm" type="button" onClick={() => replaceInput.current?.click()}>{replaceFile ? replaceFile.name : 'Choose File'}</button>
                  {replaceFile && <button className="btn btn-sm btn-icon" onClick={() => { setReplaceFile(null); if (replaceInput.current) replaceInput.current.value = '' }}>✕</button>}
                  <input ref={replaceInput} type="file" hidden onChange={e => setReplaceFile(e.target.files[0] || null)} accept="image/*,video/*,.pdf,.doc,.docx" />
                </div>
              </div>
            </div>
            <div className="modal-actions" style={{ padding: '0 18px 18px' }}>
              <button className="btn btn-sm" onClick={() => setReplaceItem(null)} disabled={replacing}>Cancel</button>
              <button className="btn btn-primary" onClick={handleReplace} disabled={replacing}>{replacing ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit banner modal (shared) */}
      {editBanner && (
        <EditBannerModal
          media={editBanner.media}
          event={editBanner.event}
          onClose={() => setEditBanner(null)}
          onSaved={res => {
            setEditBanner(null)
            const evId = editBanner.event?.id
            // refresh the affected event's media in both the main list and history timeline
            loadMedia(String(evId))
            fetchMedia(evId).then(med => {
              if (med) setHistoryMedia(prev => ({ ...prev, [String(evId)]: med }))
            }).catch(() => {})
          }}
        />
      )}
    </>
  )
}
