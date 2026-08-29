import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchWorkspaceNgos, fetchSectors, fetchActivities, fetchEventsByNgo } from '../store'

const PALETTE = ['#7B5EA7', '#B5603A', '#C08A2E', '#4F6472', '#5B6B4E', '#88693D', '#3485D4']

const MONTHLY_EVENTS = { BSCT: 20, MANN: 10, AFLF: 15 }

function ngoColor(name) {
  let h = 0
  for (const c of String(name || '')) h = c.charCodeAt(0) + ((h << 5) - h)
  return PALETTE[Math.abs(h) % PALETTE.length]
}

export default function NGOs() {
  const navigate = useNavigate()
  const [ngos, setNgos] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchWorkspaceNgos()
      .then(async (list) => {
        if (cancelled) return
        const rows = list || []
        setNgos(rows)
        const countsMap = {}
        await Promise.all(rows.map(async (n) => {
          const id = n.id ?? n.ngo_id
          if (id == null) return
          const [sectors, activities, events] = await Promise.all([
            fetchSectors({ ngo_id: id }).catch(() => []),
            fetchActivities({ ngo_id: id }).catch(() => []),
            fetchEventsByNgo(id).catch(() => []),
          ])
          countsMap[String(id)] = {
            sectors: (sectors || []).length,
            activities: (activities || []).reduce((s, a) => s + (a.status === 'Inactive' ? 0 : 1), 0),
            events: (events || []).length,
          }
        }))
        if (!cancelled) setCounts(countsMap)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const total = { sectors: 0, activities: 0, events: 0 }
  for (const c of Object.values(counts)) {
    total.sectors += c.sectors
    total.activities += c.activities
    total.events += c.events
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 16 }}>NGOs</h3>
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>NGO → Sector → Activity → Event program structure</p>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card"><div className="stat-num" style={{ color: '#7B5EA7' }}>{ngos.length}</div><div className="stat-lbl">NGOs</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: '#3485D4' }}>{total.activities}</div><div className="stat-lbl">Activities</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: '#5B6B4E' }}>{total.events}</div><div className="stat-lbl">Events</div></div>
      </div>

      {loading ? (
        <div className="loading">Loading NGOs...</div>
      ) : ngos.length === 0 ? (
        <div className="empty-state">No NGOs found</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {ngos.map(n => {
            const id = n.id ?? n.ngo_id
            const color = ngoColor(n.name || n.code)
            const c = counts[String(id)] || { sectors: 0, activities: 0, events: 0 }
            const monthly = MONTHLY_EVENTS[(n.code || n.name || '').toUpperCase()]
            return (
              <div
                key={String(id)}
                className="card"
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10, transition: 'box-shadow .15s, transform .15s', borderTop: `3px solid ${color}` }}
                onClick={() => navigate('/event-head/sectors?ngo=' + id)}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = '' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}22`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                    {(n.name || n.code || 'N').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.name || n.code || `NGO ${id}`}</div>
                    {n.code && n.name !== n.code && <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{n.code}</div>}
                  </div>
                </div>
                {monthly != null && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: `${color}14`, border: `1px solid ${color}33`, borderRadius: 'var(--radius-sm)', padding: '6px 12px' }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink)' }}>Monthly Events</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color }}>{monthly}</span>
                  </div>
                )}
                <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, textAlign: 'center', fontSize: 12 }}>
                  <div><b style={{ color, fontSize: 15 }}>{c.sectors}</b><div style={{ color: 'var(--ink-soft)', fontSize: 10 }}>Sectors</div></div>
                  <div><b style={{ color, fontSize: 15 }}>{c.activities}</b><div style={{ color: 'var(--ink-soft)', fontSize: 10 }}>Activities</div></div>
                  <div><b style={{ color, fontSize: 15 }}>{c.events}</b><div style={{ color: 'var(--ink-soft)', fontSize: 10 }}>Events</div></div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--sage)', fontWeight: 600, textAlign: 'right', marginTop: 'auto' }}>Open programs →</div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}