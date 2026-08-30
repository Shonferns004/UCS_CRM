import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchEvents, updateEventStatus, deleteEvent, EVENT_STATUSES, fetchWorkspaceNgos, fetchSectors, fetchActivities, importEventsSheet, exportEventsSheet } from '../store'
import { EnhancedTable } from '../components/Table'

const statusColor = (s) => {
  const map = { Completed:'green', Approved:'blue', Draft:'gray', Submitted:'yellow', Rejected:'red', Cancelled:'red', Closed:'green', Postponed:'yellow' }
  return map[s] || 'gray'
}

export default function EventsPage({ view } = {}) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [events, setEvents] = useState([])
  const [ngos, setNgos] = useState([])
  const [sectors, setSectors] = useState([])
  const [allActivities, setAllActivities] = useState([])
  const [ngoFilter, setNgoFilter] = useState(searchParams.get('ngo_id') || '')
  const [sectorFilter, setSectorFilter] = useState('')
  const [activityFilter, setActivityFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [loading, setLoading] = useState(true)
  const [importModal, setImportModal] = useState(false)
  const [importNgo, setImportNgo] = useState('')
  const [importFile, setImportFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchWorkspaceNgos().catch(() => []),
      fetchSectors().catch(() => []),
      fetchActivities().catch(() => []),
    ]).then(([n, s, a]) => {
      if (cancelled) return
      setNgos(n || [])
      setSectors(s || [])
      setAllActivities(a || [])
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchEvents({
      ngo_id: ngoFilter || undefined,
      sector_id: sectorFilter || undefined,
      activity_id: activityFilter || undefined,
      status: statusFilter || undefined,
      month: month || undefined,
      year: year || undefined,
    })
      .then(d => { if (!cancelled) setEvents(d || []) })
      .catch(e => console.error('EventsPage fetchEvents:', e))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ngoFilter, sectorFilter, activityFilter, statusFilter, month, year])

  const relevantSectors = useMemo(() => {
    if (!ngoFilter) return sectors
    const ids = new Set()
    for (const a of allActivities) {
      if (a.ngo_id == null || String(a.ngo_id) === ngoFilter) ids.add(String(a.sector_id))
    }
    let list = sectors.filter(s => ids.has(String(s.id)))
    if (!list.some(s => String(s.id) === sectorFilter) && sectorFilter) {
      const cur = sectors.find(s => String(s.id) === sectorFilter)
      if (cur) list = [cur, ...list]
    }
    return list
  }, [sectors, allActivities, ngoFilter, sectorFilter])

  const relevantActivities = useMemo(() => {
    let list = allActivities.filter(a =>
      String(a.sector_id) === sectorFilter &&
      (!ngoFilter || a.ngo_id == null || String(a.ngo_id) === ngoFilter)
    )
    if (activityFilter && !list.some(a => String(a.id) === String(activityFilter))) {
      const cur = allActivities.find(a => String(a.id) === String(activityFilter) && String(a.sector_id) === sectorFilter)
      if (cur) list = [cur, ...list]
    }
    return list
  }, [allActivities, ngoFilter, sectorFilter, activityFilter])

  // Sectors/activities of the NGO chosen for the sheet upload (derived client-side).
  const upNgo = useMemo(() => ngos.find(n => String(n.id) === String(importNgo)) || null, [ngos, importNgo])
  const uploadScopedSectors = useMemo(() => {
    const set = new Set()
    for (const a of allActivities) {
      if (a.ngo_id != null && String(a.ngo_id) === importNgo) set.add(String(a.sector_id))
    }
    let list = sectors.filter(s => set.has(String(s.id)))
    if (list.length === 0 && importNgo) list = sectors
    return list
  }, [sectors, allActivities, importNgo])
  const uploadScopedActivities = useMemo(() => {
    if (!importNgo) return []
    let list = allActivities.filter(a => String(a.ngo_id) === importNgo)
    if (list.length === 0) list = allActivities.filter(a => a.ngo_id == null)
    return list
  }, [allActivities, importNgo])

  const onNgo = (v) => { setNgoFilter(v); setSectorFilter(''); setActivityFilter('') }
  const onSector = (v) => { setSectorFilter(v); setActivityFilter('') }

  const localToday = () => {
    const d = new Date()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${mm}-${dd}`
  }

  const filteredEvents = useMemo(() => {
    if (!view) return events
    const today = localToday()
    return events.filter(e => {
      const date = (e.date || '').slice(0, 10)
      if (view === 'today') return date === today
      if (view === 'upcoming') return date >= today && e.status === 'Approved'
      if (view === 'completed') return e.status === 'Completed'
      return true
    })
  }, [events, view])

  const shown = filteredEvents

  const handleStatus = async (id, status) => {
    try {
      await updateEventStatus(id, status)
      setEvents(events.map(e => e.id === id ? {...e, status} : e))
    } catch (e) { console.error('EventsPage updateEventStatus:', e) }
  }
  const handleDelete = async (id) => {
    if (!confirm('Delete this event?')) return
    try {
      await deleteEvent(id)
      setEvents(events.filter(e => e.id !== id))
    } catch (e) { console.error('EventsPage deleteEvent:', e) }
  }

  const openImport = () => {
    setImportNgo('')
    setImportFile(null)
    setImportResult(null)
    setImportError('')
    if (fileRef.current) fileRef.current.value = ''
    setImportModal(true)
  }

  const handleImportSubmit = async (e) => {
    e.preventDefault()
    if (!importFile) { setImportError('Please choose an Excel/CSV file'); return }
    setImporting(true)
    setImportError('')
    setImportResult(null)
    try {
      const ngoCode = importNgo ? ngos.find(n => String(n.id) === String(importNgo)) : null
      const result = await importEventsSheet({ id: importNgo || undefined, code: (ngoCode && (ngoCode.code || ngoCode.name)) || '' }, importFile)
      setImportResult(result)
      await reload()
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setImportError(err.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const handleExport = async () => {
    try {
      const sel = ngos.find(n => String(n.id) === String(ngoFilter))
      const name = 'events' + (sel ? '_' + String(sel.code || sel.name).replace(/[^A-Za-z0-9_-]/g, '_') : '') + '.xlsx'
      await exportEventsSheet({
        ngo_id: ngoFilter || undefined,
        sector_id: sectorFilter || undefined,
        activity_id: activityFilter || undefined,
        status: statusFilter || undefined,
        month: month || undefined,
        year: year || undefined,
      }, name)
    } catch (err) {
      alert('Export failed: ' + (err.message || 'Unknown error')); console.error('EventsPage export:', err)
    }
  }

  const reload = () => {
    setLoading(true)
    return fetchEvents({
      ngo_id: ngoFilter || undefined,
      sector_id: sectorFilter || undefined,
      activity_id: activityFilter || undefined,
      status: statusFilter || undefined,
      month: month || undefined,
      year: year || undefined,
    })
      .then(d => setEvents(d || []))
      .catch(e => console.error('EventsPage fetchEvents:', e))
      .finally(() => setLoading(false))
  }

  const timeLabel = (row) => {
    if (row.start_time && row.end_time) return `${String(row.start_time).slice(0,5)} – ${String(row.end_time).slice(0,5)}`
    if (row.start_time) return String(row.start_time).slice(0,5)
    return '—'
  }

  const columns = [
    { header: 'Event Name', accessor: 'name', render: (row) => <span style={{ fontWeight: 500 }}>{row.name}</span> },
    { header: 'NGO', accessor: 'ngo_name', render: (row) => row.ngo_name || '—' },
    { header: 'Sector', accessor: 'sector_name', render: (row) => row.sector_name || '—' },
    { header: 'Activity', accessor: 'activity_name', render: (row) => row.activity_name || '—' },
    { header: 'Date', accessor: 'date', render: (row) => row.date?.slice(0, 10) || '—' },
    { header: 'Time', accessor: 'start_time', render: timeLabel },
    { header: 'Venue', accessor: 'venue' },
    {
      header: 'Status',
      accessor: 'status',
      render: (row) => (
        <select value={row.status} onChange={e => handleStatus(row.id, e.target.value)}
          className={`pill pill-${statusColor(row.status)}`}
          style={{ border: 'none', fontSize: 11, cursor: 'pointer', padding: '2px 8px' }}>
          {EVENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )
    },
    {
      header: 'Actions',
      render: (row) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-sm" onClick={() => navigate('/event-head/events/' + row.id)}>View</button>
          <button className="btn btn-sm btn-icon" onClick={(e) => { e.stopPropagation(); handleDelete(row.id) }} title="Delete">✕</button>
        </div>
      )
    },
  ]

  const years = useMemo(() => {
    const y = Number(year) || new Date().getFullYear()
    return [y - 1, y, y + 1]
  }, [year])

  const VIEWS = [
    { id: '', label: 'All Events', path: '/event-head/events' },
    { id: 'today', label: "Today's Events", path: '/event-head/events-today' },
    { id: 'upcoming', label: 'Upcoming Events', path: '/event-head/events-upcoming' },
    { id: 'completed', label: 'Completed Events', path: '/event-head/events-completed' },
  ]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ fontSize: 16 }}>{VIEWS.find(v => v.id === (view || ''))?.label || 'Events'}</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={handleExport} disabled={loading}>Export Sheet</button>
          <button className="btn btn-sm" onClick={openImport}>Upload Sheet</button>
          <button className="btn btn-primary" onClick={() => navigate('/event-head/create')}>+ New Event</button>
        </div>
      </div>

      <div className="filter-bar" style={{ marginBottom: 12, padding: 6, gap: 4, background: 'var(--bg)' }}>
        {VIEWS.map(v => (
          <button
            key={v.id}
            className={view === v.id || (!view && v.id === '') ? 'btn btn-sm btn-primary' : 'btn btn-sm'}
            style={{ padding: '6px 12px' }}
            onClick={() => navigate(v.path)}
          >{v.label}</button>
        ))}
      </div>

      <div className="filter-bar" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={ngoFilter} onChange={e => onNgo(e.target.value)}>
          <option value="">All NGOs</option>
          {ngos.map(n => <option key={n.id} value={n.id}>{n.name || n.code}</option>)}
        </select>
        <select value={sectorFilter} onChange={e => onSector(e.target.value)} disabled={!ngoFilter && relevantSectors.length === 0}>
          <option value="">All Sectors</option>
          {relevantSectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={activityFilter} onChange={e => setActivityFilter(e.target.value)} disabled={!sectorFilter || relevantActivities.length === 0}>
          <option value="">All Activities</option>
          {relevantActivities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          {EVENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={month} onChange={e => setMonth(e.target.value)}>
          <option value="">All Months</option>
          {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(e.target.value)}>
          <option value="">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="stats-grid" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card"><div className="stat-num" style={{ color: '#7B5EA7' }}>{shown.length}</div><div className="stat-lbl">Total</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: '#3485D4' }}>{shown.filter(e => e.status === 'Approved').length}</div><div className="stat-lbl">Approved</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: '#5B6B4E' }}>{shown.filter(e => e.status === 'Completed').length}</div><div className="stat-lbl">Completed</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: '#B5603A' }}>{shown.filter(e => ['Draft', 'Submitted'].includes(e.status)).length}</div><div className="stat-lbl">Pending</div></div>
      </div>
      {view && (
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 12 }}>
          Showing <b>{shown.length}</b> of {events.length} events{view === 'upcoming' ? ' (approved & scheduled from today)' : view === 'completed' ? '(marked completed)' : ''}
        </div>
      )}

      {importModal && (
        <div className="modal-overlay" onClick={() => { if (!importing) setImportModal(false) }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Upload Events Sheet</h3>
              <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-soft)' }} onClick={() => { if (!importing) setImportModal(false) }}>✕</button>
            </div>
            <form onSubmit={handleImportSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 12 }}>
                  Upload an Excel/CSV sheet of events. Each row needs an event name and a date; Sector and Activity (or Project) are matched to the DB and NGO, so events can be created in one shot. Rows that can&apos;t be matched are listed under Skipped.
                </p>
                <div className="form-row" style={{ marginBottom: 12 }}>
                  <div className="field"><label>NGO (optional — use if the sheet has no NGO column)</label>
                    <select value={importNgo} onChange={e => { setImportNgo(e.target.value); setImportResult(null); setImportError('') }}>
                      <option value="">Auto from sheet / All</option>
                      {ngos.map(n => <option key={n.id} value={n.id}>{n.name || n.code}</option>)}
                    </select>
                  </div>
                </div>
                {upNgo && (
                  <div style={{ marginBottom: 12, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: 10, background: 'var(--panel)', fontSize: 12, overflow: 'hidden' }}>
                    <div style={{ fontWeight: 600, marginBottom: 4, color: '#7B5EA7' }}>{upNgo.name || upNgo.code}</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 160px', minWidth: 130 }}>
                        <div style={{ color: 'var(--ink-soft)', fontWeight: 600, marginBottom: 2 }}>Sectors ({uploadScopedSectors.length})</div>
                        <div style={{ maxHeight: 80, overflow: 'auto', color: 'var(--ink)', lineHeight: 1.5 }}>
                          {uploadScopedSectors.length ? uploadScopedSectors.map(s => <div key={String(s.id)}>• {s.name}</div>) : <div style={{ color: 'var(--ink-soft)' }}>None found</div>}
                        </div>
                      </div>
                      <div style={{ flex: '1 1 200px', minWidth: 140 }}>
                        <div style={{ color: 'var(--ink-soft)', fontWeight: 600, marginBottom: 2 }}>Activities ({uploadScopedActivities.length})</div>
                        <div style={{ maxHeight: 80, overflow: 'auto', color: 'var(--ink)', lineHeight: 1.5 }}>
                          {uploadScopedActivities.length ? uploadScopedActivities.map(a => <div key={String(a.id)}>• {a.name}</div>) : <div style={{ color: 'var(--ink-soft)' }}>None found</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="form-row" style={{ flexWrap: 'wrap' }}>
                  <div className="field" style={{ flex: '1 1 100%', minWidth: 200 }}><label>Sheet (Excel / CSV) *</label>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={e => { setImportFile(e.target.files[0] || null); setImportResult(null); setImportError('') }} style={{ padding: '6px 0', width: '100%' }} />
                  </div>
                </div>
                {importResult && (
                  <div style={{ marginTop: 12, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: 12, background: 'var(--panel)', fontSize: 13 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6, color: '#16a34a' }}>Imported {importResult.inserted || 0} events</div>
                    <div style={{ color: 'var(--ink-soft)' }}>
                      Parsed rows: {importResult.rows_parsed || 0} · Skipped — missing date: {importResult.skipped?.missing_date || 0}, unknown activity: {importResult.skipped?.unknown_activity || 0}, unknown sector: {importResult.skipped?.unknown_sector || 0}, unknown NGO: {importResult.skipped?.unknown_ngo || 0}, duplicates: {importResult.skipped?.duplicates || 0}
                    </div>
                    {
                      importResult.skipped_details && (
                        <div style={{ marginTop: 6 }}>
                          {Object.entries(importResult.skipped_details).filter(([, v]) => Array.isArray(v) && v.length > 0).map(([k, v]) => (
                            <div key={k} style={{ color: '#B5603A', marginTop: 4 }}>
                              <span style={{ fontWeight: 600 }}>{k.replace(/_/g, ' ')}:</span> {v.join('; ')}
                            </div>
                          ))}
                        </div>
                      )
                    }
                  </div>
                )}
                {importError && <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>{importError}</div>}
              </div>
              <div className="modal-actions" style={{ padding: '0 18px 18px' }}>
                <button type="button" className="btn btn-sm" onClick={() => setImportModal(false)} disabled={importing}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={importing || !importFile}>{importing ? 'Uploading...' : 'Upload & Import'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading events...</div>
      ) : (
        <EnhancedTable
          columns={columns}
          data={shown}
          searchPlaceholder="Search events..."
          pageSize={10}
        />
      )}
    </>
  )
}