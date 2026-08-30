import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchSectors, fetchWorkspaceNgos } from '../store'
import { PageHeader, MetricCard, SearchInput, Empty, Badge } from '../components/ui'

export default function Sectors() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sectors, setSectors] = useState([])
  const [ngos, setNgos] = useState([])
  const [ngoFilter, setNgoFilter] = useState(searchParams.get('ngo') || '')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchWorkspaceNgos().then(d => { if (!cancelled) setNgos(d || []) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchSectors({ ngo_id: ngoFilter || undefined })
      .then(s => { if (!cancelled) setSectors(s || []) })
      .catch(e => console.error('Sectors fetchSectors:', e))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ngoFilter])

  const changeNgo = (v) => {
    setNgoFilter(v)
    setSearchParams(v ? { ngo: v } : {}, { replace: true })
  }

  const activeNgo = ngos.find(n => String(n.id) === String(ngoFilter))

  const totalActivities = sectors.reduce((s, x) => s + (x.activity_count || 0), 0)
  const totalEvents = sectors.reduce((s, x) => s + (x.event_count || 0), 0)

  return (
    <>
      <PageHeader
        title="Sectors"
        subtitle={activeNgo ? `Programs under ${activeNgo.name || activeNgo.code}` : 'NGO → Sector → Activity program structure'}
        actions={<button className="eh-btn" onClick={() => navigate('/event-head/ngos')}>← NGOs</button>}
      />

      <div className="eh-metrics">
        <MetricCard index={0} number={sectors.length} label="Sectors" color="var(--eh-primary)" />
        <MetricCard index={1} number={totalActivities} label="Activities" color="var(--eh-secondary)" />
        <MetricCard index={2} number={totalEvents} label="Events" color="var(--eh-success)" />
        {activeNgo && <MetricCard index={3} number={ngoFilter} label="Active NGO" color="#eab308" />}
      </div>

      <div className="eh-toolbar">
        <SearchInput placeholder="Search sectors…" value="" onChange={() => {}} />
        <select className="eh-select" value={ngoFilter} onChange={e => changeNgo(e.target.value)}>
          <option value="">All NGOs</option>
          {ngos.map(n => <option key={n.id} value={n.id}>{n.name || n.code}</option>)}
        </select>
        <span style={{ fontSize: 13, color: 'var(--eh-ink-soft)' }}>{sectors.length} sectors</span>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--eh-ink-soft)' }}>Loading sectors…</div>
      ) : sectors.length === 0 ? (
        <div className="eh-section"><Empty>No sectors found</Empty></div>
      ) : (
        <div className="eh-grid-auto">
          {sectors.map(s => (
            <div
              key={s.id}
              className="eh-section"
              style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8, padding: '18px 20px', transition: 'box-shadow .15s, transform .15s' }}
              onClick={() => navigate('/event-head/activities?sector=' + s.id)}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = '' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 650, fontSize: 14.5, lineHeight: 1.35, color: 'var(--eh-ink)' }}>{s.name}</div>
                </div>
                <Badge tone={s.is_active ? 'primary' : 'muted'}>{s.is_active ? 'Active' : 'Inactive'}</Badge>
              </div>
              {s.description && <div style={{ fontSize: 12, color: 'var(--eh-ink-soft)', lineHeight: 1.5 }}>{s.description}</div>}
              <div style={{ marginTop: 'auto', paddingTop: 6, borderTop: '1px solid var(--eh-line)', display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: 'var(--eh-ink-soft)' }}>
                <span><b style={{ color: 'var(--eh-ink)' }}>{s.activity_count || 0}</b> Activities</span>
                <span><b style={{ color: 'var(--eh-ink)' }}>{s.event_count || 0}</b> Events</span>
                <span style={{ marginLeft: 'auto', color: 'var(--eh-primary)', fontWeight: 600 }}>View →</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}