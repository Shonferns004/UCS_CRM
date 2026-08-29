import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchSectors, fetchWorkspaceNgos } from '../store'

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={() => navigate('/event-head/ngos')}>← NGOs</button>
            {activeNgo && <span className="pill pill-blue" style={{ fontWeight: 600 }}>{activeNgo.name || activeNgo.code}</span>}
          </div>
          <h3 style={{ fontSize: 16 }}>Sectors</h3>
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>NGO → Sector → Activity program structure</p>
        </div>
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <select value={ngoFilter} onChange={e => changeNgo(e.target.value)}>
            <option value="">All NGOs</option>
            {ngos.map(n => <option key={n.id} value={n.id}>{n.name || n.code}</option>)}
          </select>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card"><div className="stat-num" style={{ color: '#7B5EA7' }}>{sectors.length}</div><div className="stat-lbl">Sectors</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: '#3485D4' }}>{totalActivities}</div><div className="stat-lbl">Activities</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: '#5B6B4E' }}>{totalEvents}</div><div className="stat-lbl">Events</div></div>
      </div>

      {loading ? (
        <div className="loading">Loading sectors...</div>
      ) : sectors.length === 0 ? (
        <div className="empty-state">No sectors found</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {sectors.map(s => (
            <div
              key={s.id}
              className="card"
              style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8, transition: 'box-shadow .15s, transform .15s' }}
              onClick={() => navigate('/event-head/activities?sector=' + s.id)}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = '' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.35, color: 'var(--ink)' }}>{s.name}</div>
                </div>
                <span className={`pill ${s.is_active ? 'pill-blue' : 'pill-gray'}`}>{s.is_active ? 'Active' : 'Inactive'}</span>
              </div>
              {s.description && <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5 }}>{s.description}</div>}
              <div style={{ marginTop: 'auto', paddingTop: 6, borderTop: '1px solid var(--line)', display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: 'var(--ink-soft)' }}>
                <span><b style={{ color: 'var(--ink)' }}>{s.activity_count || 0}</b> Activities</span>
                <span><b style={{ color: 'var(--ink)' }}>{s.event_count || 0}</b> Events</span>
                <span style={{ marginLeft: 'auto', color: 'var(--sage)', fontWeight: 600 }}>View →</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}