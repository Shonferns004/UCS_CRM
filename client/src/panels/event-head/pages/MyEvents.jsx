import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchWorkspaceNgos, fetchSectors, fetchActivities, fetchEvents, EVENT_STATUSES } from '../store'

export default function MyEvents() {
  const navigate = useNavigate()
  const [ngos, setNgos] = useState([])
  const [sectors, setSectors] = useState([])
  const [allActivities, setAllActivities] = useState([])
  const [events, setEvents] = useState([])
  const [ngoFilter, setNgoFilter] = useState('')
  const [sectorFilter, setSectorFilter] = useState('')
  const [activityFilter, setActivityFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)

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
    }).catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
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
    }).then(d => { if (!cancelled) setEvents(d || []) })
      .catch(e => console.error('MyEvents fetchEvents:', e))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ngoFilter, sectorFilter, activityFilter, statusFilter])

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

  const onNgo = (v) => { setNgoFilter(v); setSectorFilter(''); setActivityFilter('') }
  const onSector = (v) => { setSectorFilter(v); setActivityFilter('') }

  const sorted = [...events].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const dayOfWeek = (d) => {
    const dt = new Date(d)
    return isNaN(dt) ? '' : dayNames[dt.getDay()]
  }
  const timeLabel = (ev) => {
    if (ev.start_time && ev.end_time) return `${String(ev.start_time).slice(0,5)} – ${String(ev.end_time).slice(0,5)}`
    if (ev.start_time) return String(ev.start_time).slice(0,5)
    return '—'
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 16 }}>Events</h3>
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>NGO-wise event schedule</p>
        </div>
        <div className="filter-bar" style={{ marginBottom: 0, flexWrap: 'wrap' }}>
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
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        {loading ? (
          <div className="loading" style={{ padding: 60 }}>Loading events...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--sage-soft)', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>Event</th>
                <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>NGO</th>
                <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>Sector</th>
                <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>Activity</th>
                <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>Date</th>
                <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>Day</th>
                <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>Time</th>
                <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>Venue</th>
                <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--ink-soft)' }}>
                  No events match the current filters
                </td></tr>
              )}
              {sorted.map(ev => (
                <tr key={ev.id} style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer' }} onClick={() => navigate('/event-head/events/' + ev.id)} title="Open event details">
                  <td style={{ padding: '6px 12px', fontWeight: 500 }}>{ev.name || 'Untitled Event'}</td>
                  <td style={{ padding: '6px 12px', color: 'var(--ink-soft)' }}>{ev.ngo_name || '—'}</td>
                  <td style={{ padding: '6px 12px', color: 'var(--ink-soft)' }}>{ev.sector_name || '—'}</td>
                  <td style={{ padding: '6px 12px', color: 'var(--ink-soft)' }}>{ev.activity_name || '—'}</td>
                  <td style={{ padding: '6px 12px' }}>{ev.date ? ev.date.slice(0, 10) : '—'}</td>
                  <td style={{ padding: '6px 12px', color: 'var(--ink-soft)' }}>{dayOfWeek(ev.date)}</td>
                  <td style={{ padding: '6px 12px', color: 'var(--ink-soft)' }}>{timeLabel(ev)}</td>
                  <td style={{ padding: '6px 12px' }}>{ev.venue || '—'}</td>
                  <td style={{ padding: '6px 12px' }}><span className="pill pill-gray">{ev.status || '—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}