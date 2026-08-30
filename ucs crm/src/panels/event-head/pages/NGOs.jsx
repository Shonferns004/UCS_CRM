import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchWorkspaceNgos, fetchSectors, fetchActivities, fetchEventsByNgo } from '../store'
import { PageHeader, MetricCard, SearchInput, Empty } from '../components/ui'

const PALETTE = ['#2036bd', '#6b38d4', '#7B5EA7', '#1e6f9f', '#0f766e', '#b5603a', '#3485d4']

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
      <PageHeader
        title="NGOs"
        subtitle="NGO → Sector → Activity → Event program structure"
        actions={<button className="eh-btn" onClick={() => navigate('/event-head/create')}>+ New Program</button>}
      />

      <div className="eh-metrics">
        <MetricCard index={0} number={ngos.length} label="NGOs" color="var(--eh-primary)" />
        <MetricCard index={1} number={total.sectors} label="Sectors" color="#1e6f9f" />
        <MetricCard index={2} number={total.activities} label="Activities" color="var(--eh-secondary)" />
        <MetricCard index={3} number={total.events} label="Events" color="var(--eh-success)" />
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--eh-ink-soft)' }}>Loading NGOs…</div>
      ) : ngos.length === 0 ? (
        <div className="eh-section"><Empty>No NGOs found</Empty></div>
      ) : (
        <div className="eh-toolbar" style={{ marginTop: 0 }}>
          <SearchInput placeholder="Search NGOs…" value="" onChange={() => {}} />
          <span style={{ fontSize: 13, color: 'var(--eh-ink-soft)' }}>{ngos.length} NGOs in workspace</span>
        </div>
      )}

      {!loading && ngos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 16 }}>
          {ngos.map(n => {
            const id = n.id ?? n.ngo_id
            const color = ngoColor(n.name || n.code)
            const c = counts[String(id)] || { sectors: 0, activities: 0, events: 0 }
            const monthly = MONTHLY_EVENTS[(n.code || n.name || '').toUpperCase()]
            return (
              <div
                key={String(id)}
                className="eh-section"
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'visible', padding: '18px 20px', borderTop: `3px solid ${color}`, transition: 'box-shadow .15s, transform .15s' }}
                onClick={() => navigate('/event-head/sectors?ngo=' + id)}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = '' }}
              >
                <div className="eh-row" style={{ gap: 12 }}>
                  <div className="eh-avatar" style={{ background: `${color}`, width: 42, height: 42, borderRadius: 12 }}>{String(n.name || n.code || 'N').slice(0, 2).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 650, fontSize: 14.5, color: 'var(--eh-ink)' }}>{n.name || n.code || `NGO ${id}`}</div>
                    {n.code && n.name !== n.code && <div style={{ fontSize: 11, color: 'var(--eh-ink-soft)' }}>{n.code}</div>}
                  </div>
                </div>
                {monthly != null && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 12, padding: '6px 12px' }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--eh-ink)' }}>Monthly Events</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color }}>{monthly}</span>
                  </div>
                )}
                <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--eh-tint-1)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, textAlign: 'center', fontSize: 12 }}>
                  <div><b style={{ color, fontSize: 15 }}>{c.sectors}</b><div style={{ color: 'var(--eh-ink-soft)', fontSize: 10 }}>Sectors</div></div>
                  <div><b style={{ color, fontSize: 15 }}>{c.activities}</b><div style={{ color: 'var(--eh-ink-soft)', fontSize: 10 }}>Activities</div></div>
                  <div><b style={{ color, fontSize: 15 }}>{c.events}</b><div style={{ color: 'var(--eh-ink-soft)', fontSize: 10 }}>Events</div></div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--eh-primary)', fontWeight: 600, textAlign: 'right', marginTop: 'auto' }}>Open programs →</div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}