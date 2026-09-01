import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchDeadlineNotifs } from '../store'

const WINDOW_DAYS = 30

const groupLabel = (d) => {
  if (d.days <= 0) return 'Due Today'
  if (d.days === 1) return 'Due Tomorrow'
  if (d.days <= 7) return 'This Week'
  return 'Later'
}

const GROUP_ORDER = ['Due Today', 'Due Tomorrow', 'This Week', 'Later']
const GROUP_COLOR = {
  'Due Today': 'var(--eh-danger)',
  'Due Tomorrow': 'var(--eh-warn)',
  'This Week': 'var(--eh-primary)',
  'Later': 'var(--eh-ink-soft)',
}

export default function Notifications() {
  const navigate = useNavigate()
  const [deadlines, setDeadlines] = useState([])
  const [deadlineLoaded, setDeadlineLoaded] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = () => {
    fetchDeadlineNotifs(WINDOW_DAYS)
      .then(d => { setDeadlines(d || []); setLastUpdated(new Date()) })
      .catch(() => {})
      .finally(() => setDeadlineLoaded(true))
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 60 * 1000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [])

  const byGroup = useMemo(() => {
    const map = {}
    for (const g of GROUP_ORDER) map[g] = []
    for (const d of deadlines) {
      const g = groupLabel(d)
      ;(map[g] || (map[g] = [])).push(d)
    }
    return map
  }, [deadlines])

  const total = deadlines.length
  const urgentCount = deadlines.filter(d => d.days <= 0).length
  const groups = GROUP_ORDER.filter(g => (byGroup[g] || []).length > 0)

  return (
    <div className="card">
      <div className="card-head"><h3>Upcoming Event Notifications</h3></div>
      <div className="card-pad" style={{ padding: 0 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--eh-line)', background: 'var(--eh-tint-1)' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--eh-ink)' }}>Upcoming events — auto-refreshed live</div>
          <div style={{ fontSize: 11.5, color: 'var(--eh-ink-soft)', marginTop: 2 }}>
            {total === 0
              ? 'No events scheduled within the next 30 days.'
              : `${total} upcoming event${total > 1 ? 's' : ''} ${urgentCount > 0 ? `· ${urgentCount} happening today — ` : ''}refreshes every 60s.`}
          </div>
          {lastUpdated && <div style={{ fontSize: 10.5, color: 'var(--eh-ink-faint)', marginTop: 4 }}>Updated {lastUpdated.toLocaleTimeString()}</div>}
        </div>

        {!deadlineLoaded && <div style={{ padding: 40, textAlign: 'center', color: 'var(--eh-ink-soft)', fontSize: 12 }}>Loading notifications…</div>}

        {deadlineLoaded && total === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--eh-ink-soft)' }}>No upcoming events in the next {WINDOW_DAYS} days.</div>
        )}

        {groups.map(g => (
          <div key={g}>
            <div style={{
              padding: '7px 18px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
              color: GROUP_COLOR[g], background: 'var(--eh-tint-1)', borderBottom: '1px solid var(--eh-line)',
            }}>
              {g} · {byGroup[g].length}
            </div>
            {byGroup[g].map(d => (
              <div key={d.key} onClick={() => navigate('/event-head/events/' + d.eventId)}
                style={{ display: 'flex', gap: 12, padding: '13px 18px', borderBottom: '1px solid var(--eh-line)', cursor: 'pointer', background: d.urgent ? 'var(--eh-danger-soft)' : 'transparent' }}
                onMouseEnter={e => e.currentTarget.style.background = d.urgent ? 'var(--eh-danger-soft)' : 'var(--eh-tint-1)'}
                onMouseLeave={e => e.currentTarget.style.background = d.urgent ? 'var(--eh-danger-soft)' : 'transparent'}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.urgent ? 'var(--eh-danger)' : GROUP_COLOR[groupLabel(d)], marginTop: 6, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--eh-ink)' }}>{d.title}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 8px', borderRadius: 999, background: d.urgent ? 'var(--eh-danger)' : GROUP_COLOR[groupLabel(d)], color: '#fff', whiteSpace: 'nowrap' }}>{d.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--eh-ink-soft)', marginTop: 2, wordBreak: 'break-word' }}>{d.body || 'Upcoming event'}</div>
                  <div style={{ fontSize: 11, color: 'var(--eh-ink-faint)', marginTop: 4 }}>{d.date}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}