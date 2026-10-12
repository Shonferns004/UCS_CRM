import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchDashboardStats, fetchDashboardOptions, fetchDeadlineNotifs, fetchCalendarEvents } from '../store'
import { PageHeader, MetricCard, SectionCard } from '../components/ui'
import RecentNotices from '../../../components/RecentNotices'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const TODAY_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Status → colour. Draft amber, Approved green, Completed blue, Rejected/Cancelled red.
const STATUS_TONES = {
  Draft: ['#c98a00', '#fdf3dd'],
  Submitted: ['#c98a00', '#fdf3dd'],
  Pending: ['#c98a00', '#fdf3dd'],
  Postponed: ['#c98a00', '#fdf3dd'],
  Upcoming: ['#c98a00', '#fdf3dd'],
  Approved: ['#12a150', '#e6f6ec'],
  Closed: ['#12a150', '#e6f6ec'],
  Completed: ['#2f6fed', '#e8f0fe'],
  Rejected: ['#d92d4a', '#fdeaee'],
  Cancelled: ['#d92d4a', '#fdeaee'],
}
const toneStyle = (status) => {
  const [color, background] = STATUS_TONES[status] || ['#6b7280', '#eef0f6']
  return { color, background }
}

const StatusBadge = ({ status }) =>
  status ? <span className="ehd-status" style={toneStyle(status)}>{status}</span> : null

function EmptyPanel({ icon = 'inbox', children }) {
  return (
    <div className="ehd-empty">
      <span className="material-symbols-outlined">{icon}</span>
      <div>{children}</div>
    </div>
  )
}

const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return String(d).slice(0, 10)
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

const fmtDay = (d) => { if (!d) return ''; const dt = new Date(d); return isNaN(dt.getTime()) ? '' : TODAY_WEEKDAYS[dt.getDay()] }

const fmtTime = (t) => { if (!t) return '—'; const s = String(t); return s.length >= 5 ? s.slice(0, 5) : s }

function Caret() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: '-2px' }}><polyline points="9 18 15 12 9 6" /></svg>
}

const Icon = ({ path, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{path}</svg>
)

export default function EventDashboard() {
  const navigate = useNavigate()
  const [ngos, setNgos] = useState([])
  const [sectors, setSectors] = useState([])
  const [allActivities, setAllActivities] = useState([])
  const [ngoFilter, setNgoFilter] = useState('')
  const [sectorFilter, setSectorFilter] = useState('')
  const [activityFilter, setActivityFilter] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deadlines, setDeadlines] = useState([])

  useEffect(() => {
    let cancelled = false
    fetchDashboardOptions().then(({ ngos, sectors, activities }) => {
      if (cancelled) return
      setNgos(ngos || [])
      setSectors(sectors || [])
      setAllActivities(activities || [])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchDashboardStats({
      ngo_id: ngoFilter || undefined,
      sector_id: sectorFilter || undefined,
      activity_id: activityFilter || undefined,
      month: month || undefined,
      year: year || undefined,
    })
      .then(d => { if (!cancelled) setStats(d || null) })
      .catch(e => { if (!cancelled) setError(e && e.message ? e.message : 'Unable to load dashboard data.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ngoFilter, sectorFilter, activityFilter, month, year])

  /* Dynamic upcoming-deadline notifications (next 5 days), refreshed live. */
  useEffect(() => {
    let cancelled = false
    const load = () => fetchDeadlineNotifs(5).then(d => { if (!cancelled) setDeadlines(d || []) }).catch(() => {})
    load()
    const timer = setInterval(load, 60 * 1000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  const relevantSectors = useMemo(() => {
    if (!ngoFilter) return sectors
    const ids = new Set()
    for (const a of allActivities) {
      if (a.ngo_id == null || String(a.ngo_id) === ngoFilter) ids.add(String(a.sector_id))
    }
    let list = sectors.filter(s => ids.has(String(s.id)))
    if (sectorFilter && !list.some(s => String(s.id) === String(sectorFilter))) {
      const cur = sectors.find(s => String(s.id) === String(sectorFilter))
      if (cur) list = [cur, ...list]
    }
    return list
  }, [sectors, allActivities, ngoFilter, sectorFilter])

  const relevantActivities = useMemo(() => {
    let list = allActivities.filter(a =>
      String(a.sector_id) === String(sectorFilter) &&
      (!ngoFilter || a.ngo_id == null || String(a.ngo_id) === ngoFilter)
    )
    if (activityFilter && !list.some(a => String(a.id) === String(activityFilter))) {
      const cur = allActivities.find(a => String(a.id) === String(activityFilter) && String(a.sector_id) === String(sectorFilter))
      if (cur) list = [cur, ...list]
    }
    return list
  }, [allActivities, ngoFilter, sectorFilter, activityFilter])

  const onNgo = (v) => { setNgoFilter(v); setSectorFilter(''); setActivityFilter('') }
  const onSector = (v) => { setSectorFilter(v); setActivityFilter('') }

  const years = useMemo(() => {
    const y = Number(year) || new Date().getFullYear()
    return [y - 1, y, y + 1]
  }, [year])

  const open = (id) => navigate('/event-head/events/' + id)
  const openMedia = (id) => navigate('/event-head/media-management?event=' + id)

  /* Month chosen for the next event. The day itself is always picked on the
     planner grid — this only decides which month Create Event and the planner
     open on, so the two never disagree about which month is being planned. */
  const [planMonth, setPlanMonth] = useState(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  })
  const planYears = useMemo(() => {
    const y = new Date().getFullYear()
    return [y, y + 1]
  }, [])
  const goCreate = () => navigate('/event-head/create?month=' + planMonth)
  const goPlanner = () => navigate('/event-head/monthly-planner?month=' + planMonth)

  /* Programmes already planned in the month chosen above. Same feed the Monthly
     Planner grid draws from, so this list can never disagree with the calendar. */
  const [monthProgs, setMonthProgs] = useState([])
  const [progsLoading, setProgsLoading] = useState(false)
  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(planMonth)) return
    const [y, m] = planMonth.split('-').map(Number)
    const first = new Date(y, m - 1, 1)
    const last = new Date(y, m, 0)
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    let cancelled = false
    setProgsLoading(true)
    fetchCalendarEvents({ start: iso(first), end: iso(last) })
      .then(d => { if (!cancelled) setMonthProgs(Array.isArray(d) ? d : []) })
      .catch(err => { console.error('programmes fetch', err); if (!cancelled) setMonthProgs([]) })
      .finally(() => { if (!cancelled) setProgsLoading(false) })
    return () => { cancelled = true }
  }, [planMonth])

  const progsByDay = useMemo(() => {
    const map = new Map()
    for (const ev of monthProgs) {
      const p = ev.extendedProps || {}
      const day = String(p.date || ev.date || '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue
      if (!map.has(day)) map.set(day, [])
      map.get(day).push(ev)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [monthProgs])

  const labelOf = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

  const k = stats?.kpis || {}
  const maxNgoCount = Math.max(1, ...(stats?.events_by_ngo || []).map(n => n.count))

  const actions = (
    <>
      {/* Month leads the action row: pick the month, then either open the form to
          fill in details or jump straight to the grid to click the exact day. */}
      <select
        className="eh-select"
        value={planMonth}
        onChange={e => setPlanMonth(e.target.value)}
        aria-label="Month to plan"
        style={{ minWidth: 140 }}
      >
        {planYears.map(y => MONTHS.map((m, i) => {
          const val = `${y}-${String(i + 1).padStart(2, '0')}`
          return <option key={val} value={val}>{m} {y}</option>
        }))}
      </select>
      <button className="eh-btn eh-btn-primary" onClick={goCreate}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Create Event
      </button>
      <button className="eh-btn" onClick={goPlanner}>Monthly Planner <Caret /></button>
      <button className="eh-btn" onClick={() => navigate('/event-head/activities')}>Add Activity</button>
      <button className="eh-btn" onClick={() => navigate('/event-head/reports')}>Event Reports</button>
    </>
  )

  return (
    <div className="ehd">
      <PageHeader
        title="Event Management Overview"
        subtitle={stats?.generated_at
          ? `Updated ${new Date(stats.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · all data from Event Head workspace`
          : 'Digital Team operational workspace'}
        actions={actions}
      />

      <div className="ehd-filters">
        <select className="eh-select" value={ngoFilter} onChange={e => onNgo(e.target.value)} aria-label="NGO">
          <option value="">All NGOs</option>
          {ngos.map(n => <option key={n.id} value={n.id}>{n.name || n.code}</option>)}
        </select>
        <select className="eh-select" value={month} onChange={e => setMonth(e.target.value)} aria-label="Month">
          <option value="">All Months</option>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select className="eh-select" value={year} onChange={e => setYear(e.target.value)} aria-label="Year">
          <option value="">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="eh-select" value={sectorFilter} onChange={e => onSector(e.target.value)} disabled={!ngoFilter && relevantSectors.length === 0} aria-label="Sector">
          <option value="">All Sectors</option>
          {relevantSectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="eh-select" value={activityFilter} onChange={e => setActivityFilter(e.target.value)} disabled={!sectorFilter || relevantActivities.length === 0} aria-label="Activity">
          <option value="">All Activities</option>
          {relevantActivities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {error && (
        <div className="ehd-error">
          <span>Unable to load dashboard data.</span>
          {error !== 'Unable to load dashboard data.' && <small>{error}</small>}
          <button className="eh-btn eh-btn-primary" onClick={() => { setError(null); setLoading(true); fetchDashboardStats({
            ngo_id: ngoFilter || undefined, sector_id: sectorFilter || undefined,
            activity_id: activityFilter || undefined, month: month || undefined, year: year || undefined,
          }).then(d => setStats(d || null)).catch(e => setError(e && e.message ? e.message : 'Unable to load dashboard data.')).finally(() => setLoading(false)) }}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="ehd-loading">Loading dashboard…</div>
      ) : !error && stats ? (
        <>
          <div className="eh-metrics">
            <MetricCard index={0} number={k.total_events ?? 0} label="Total Events"
              icon={<Icon path={<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>} />}
              color="var(--d-purple)" />
            <MetricCard index={1} number={k.upcoming_events ?? 0} label="Upcoming Events"
              icon={<Icon path={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>} />}
              color="var(--d-blue)" />
            <MetricCard index={2} number={k.today_events ?? 0} label="Today's Events"
              icon={<Icon path={<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>} />}
              color="var(--d-amber)" />
            <MetricCard index={3} number={k.completed_events ?? 0} label="Completed Events"
              icon={<Icon path={<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>} />}
              color="var(--d-green)" />
            <MetricCard index={4} number={stats.this_month?.total ?? 0} label="This Month Events"
              icon={<Icon path={<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>} />}
              color="var(--d-purple)" />
          </div>

          <SectionCard
            title="Programmes"
            sub={`${MONTHS[Number(planMonth.slice(5, 7)) - 1]} ${planMonth.slice(0, 4)} · ${monthProgs.length} planned`}
          >
            {progsLoading ? (
              <div className="ehd-muted">Loading programmes…</div>
            ) : progsByDay.length === 0 ? (
              <EmptyPanel icon="calendar_month">
                No programmes planned in {MONTHS[Number(planMonth.slice(5, 7)) - 1]} {planMonth.slice(0, 4)}.
              </EmptyPanel>
            ) : (
              <div className="ehd-prog-list">
                {progsByDay.map(([day, items]) => (
                  <div key={day}>
                    <div className="ehd-prog-day">{labelOf(day).toUpperCase()}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {items.map(ev => {
                        const p = ev.extendedProps || {}
                        const time = String(p.startTime || '').slice(0, 5)
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            className="ehd-prog"
                            onClick={() => navigate('/event-head/events/' + ev.id)}
                            title={p.description || ev.title}
                          >
                            <span className="ehd-prog-body">
                              <span className="ehd-prog-title">{ev.title}</span>
                              <span className="ehd-prog-meta">
                                {p.ngoName && <span className="ehd-chip">{p.ngoName}</span>}
                                {time && <span className="ehd-time">{time}</span>}
                              </span>
                            </span>
                            <StatusBadge status={p.status} />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {deadlines.length > 0 && (
            <SectionCard title="Upcoming Deadlines" sub="Events due within the next 5 days · auto-updates"
              headRight={
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--d-muted)' }}>{deadlines.length} approaching</span>
                  <button className="eh-btn" onClick={() => navigate('/event-head/notifications')}>View Notifications</button>
                </div>
              }>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {deadlines.slice(0, 6).map(d => (
                  <div key={d.key} className="ehd-attn" onClick={() => open(d.eventId)}>
                    <span className="ehd-attn-dot" style={{ background: d.urgent ? 'var(--d-red)' : 'var(--d-purple)' }} />
                    <div className="ehd-attn-body">
                      <div className="ehd-attn-title">{d.title}</div>
                      <div className="ehd-attn-date">{d.body} · {d.date}</div>
                    </div>
                    <span className="ehd-status" style={{ color: d.urgent ? 'var(--d-red)' : 'var(--d-purple)', background: d.urgent ? 'var(--d-red-soft)' : 'var(--d-purple-soft)' }}>{d.label}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          <div className="eh-grid-2">
            <SectionCard title="Today's Events" sub="Real events happening today"
              headRight={<button className="eh-btn" onClick={() => navigate('/event-head/events-today')}>Today's Events</button>}>
              {(stats.today_events || []).length === 0 ? (
                <EmptyPanel icon="event_busy">No events today</EmptyPanel>
              ) : (
                <div>
                  {(stats.today_events || []).map(ev => (
                    <div key={ev.id} onClick={() => open(ev.id)} className="ehd-attn">
                      <div className="ehd-datebox">
                        <div className="ehd-datebox-t">{fmtTime(ev.start_time)}</div>
                      </div>
                      <div className="ehd-attn-body">
                        <div className="ehd-attn-title">{ev.name || 'Untitled'}</div>
                        <div className="ehd-attn-date">{[ev.ngo_name, ev.sector_name, ev.activity_name].filter(Boolean).join(' · ')}</div>
                        {ev.venue && <div className="ehd-attn-date">📍 {ev.venue}</div>}
                      </div>
                      <StatusBadge status={ev.status} />
                      <button className="eh-btn" onClick={(e) => { e.stopPropagation(); openMedia(ev.id) }}>Manage media</button>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Upcoming Events" sub="Next upcoming from the database"
              headRight={<button className="eh-btn" onClick={() => navigate('/event-head/events')}>View all →</button>}>
              {(stats.upcoming_events || []).length === 0 ? (
                <EmptyPanel icon="event">No upcoming events</EmptyPanel>
              ) : (
                <div>
                  {(stats.upcoming_events || []).slice(0, 8).map(ev => (
                    <div key={ev.id} onClick={() => open(ev.id)} className="ehd-attn">
                      <div className="ehd-datebox">
                        <div className="ehd-datebox-d">{fmtDay(ev.date)}</div>
                        <div className="ehd-datebox-n">{fmtDate(ev.date).split(' ')[0]}</div>
                      </div>
                      <div className="ehd-attn-body">
                        <div className="ehd-attn-title">{ev.name || 'Untitled'}</div>
                        <div className="ehd-attn-date">{[ev.ngo_name, ev.sector_name, ev.activity_name].filter(Boolean).join(' · ')}</div>
                        <div className="ehd-attn-date">{[fmtTime(ev.start_time), ev.venue].filter(Boolean).join(' · ')}</div>
                      </div>
                      <StatusBadge status={ev.status} />
                      <button className="eh-btn" onClick={(e) => { e.stopPropagation(); openMedia(ev.id) }}>Manage media</button>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard title="This Month"
            sub={`${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()} · from real event data`}
            headRight={<div className="ehd-month-badge">{MONTHS[new Date().getMonth()]}</div>}>
            <div className="ehd-month-grid">
              <div>
                <div className="ehd-m-num" style={{ color: 'var(--d-purple)' }}>{stats.this_month?.total ?? 0}</div>
                <div className="ehd-m-lbl">Total</div>
              </div>
              <div>
                <div className="ehd-m-num" style={{ color: 'var(--d-amber)' }}>{stats.this_month?.upcoming ?? 0}</div>
                <div className="ehd-m-lbl">Upcoming</div>
              </div>
              <div>
                <div className="ehd-m-num" style={{ color: 'var(--d-green)' }}>{stats.this_month?.completed ?? 0}</div>
                <div className="ehd-m-lbl">Completed</div>
              </div>
              <div>
                <div className="ehd-m-num" style={{ color: 'var(--eh-ink,#0f1128)' }}>{stats.this_week?.count ?? 0}</div>
                <div className="ehd-m-lbl">This week</div>
              </div>
            </div>
          </SectionCard>

          <div className="eh-grid-2">
            <SectionCard title="NGO Performance" sub="Real event counts per NGO">
              {(stats.events_by_ngo || []).length === 0 ? (
                <EmptyPanel icon="bar_chart">No NGO data available</EmptyPanel>
              ) : (
                <div>
                  {(stats.events_by_ngo || []).map(n => (
                    <div key={n.ngo_id} className="ehd-bar-row"
                      onClick={() => navigate(`/event-head/sectors?ngo=${n.ngo_id}`)}
                      title={`Open ${n.ngo_name || ''} programs (Sector → Activity → Event)`}
                      style={{ opacity: ngoFilter && String(n.ngo_id) !== String(ngoFilter) ? 0.5 : 1 }}>
                      <div className="ehd-bar-top">
                        <span className="ehd-bar-name">{n.ngo_name || '—'}</span>
                        <span className="ehd-bar-count">{n.count}</span>
                      </div>
                      <div className="ehd-bar-track">
                        <div className="ehd-bar-fill" style={{ width: `${Math.round((n.count / maxNgoCount) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Events by Sector" headRight={<button className="eh-btn" onClick={() => navigate('/event-head/sectors')}>Manage Sectors</button>}>
              {(stats.events_by_sector || []).length === 0 ? (
                <EmptyPanel icon="category">No sector data available</EmptyPanel>
              ) : (
                <div className="ehd-sector-grid">
                  {(stats.events_by_sector || []).map(s => {
                    const active = sectorFilter && String(s.id) === String(sectorFilter)
                    return (
                      <div key={s.id}
                        className={`ehd-sector${(s.event_count ?? 0) > 0 ? ' has-events' : ''}`}
                        onClick={() => navigate(`/event-head/activities?sector=${s.id}`)}>
                        <div className="ehd-sector-name">{s.name}{active ? ' •' : ''}</div>
                        <div className="ehd-sector-stats">
                          <span><b>{s.activity_count ?? 0}</b> activities</span>
                          <span><b>{s.event_count ?? 0}</b> events</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="eh-grid-2">
            <SectionCard title="Activities with Upcoming Events">
              {(stats.activities_with_upcoming_events || []).length === 0 ? (
                <EmptyPanel icon="event_available">No activities have upcoming events</EmptyPanel>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr><th>Activity</th><th>Sector</th><th>NGO</th><th>Upcoming</th><th>Next Event</th></tr>
                    </thead>
                    <tbody>
                      {(stats.activities_with_upcoming_events || []).slice(0, 8).map(a => (
                        <tr key={a.activity_id} style={{ cursor: 'pointer' }} onClick={() => navigate('/event-head/activities/' + a.activity_id)}>
                          <td style={{ fontWeight: 600 }}>{a.activity_name}</td>
                          <td>{a.sector_name || '—'}</td>
                          <td>{a.ngo_name || 'All NGOs'}</td>
                          <td><span className="ehd-status" style={{ color: 'var(--d-purple)', background: 'var(--d-purple-soft)' }}>{a.upcoming_count}</span></td>
                          <td>{fmtDate(a.next_event_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Events Needing Attention" headRight={<span style={{ fontSize: 12, color: 'var(--d-muted)' }}>{stats.attention?.length || 0} items</span>}>
              {(stats.attention || []).length === 0 ? (
                <EmptyPanel icon="check_circle">All events are in good shape</EmptyPanel>
              ) : (
                <div>
                  {(stats.attention || []).map(ev => {
                    const overdue = ev.attention_type === 'overdue'
                    const info = ev.attention_type === 'info'
                    const dot = overdue ? 'var(--d-red)' : info ? 'var(--d-purple)' : 'var(--d-amber)'
                    const badge = overdue
                      ? { color: 'var(--d-red)', background: 'var(--d-red-soft)', label: 'Overdue · mark completed' }
                      : info
                        ? { color: 'var(--d-purple)', background: 'var(--d-purple-soft)', label: ev.attention_reason }
                        : { color: 'var(--d-amber)', background: 'var(--d-amber-soft)', label: ev.attention_reason || 'Pending approval' }
                    return (
                      <div key={ev.id} className="ehd-attn" onClick={() => open(ev.id)}>
                        <span className="ehd-attn-dot" style={{ background: dot }} />
                        <div className="ehd-attn-body">
                          <div className="ehd-attn-title">{ev.name || 'Untitled'}</div>
                          <div className="ehd-attn-date">{fmtDate(ev.date)}{ev.venue ? ' · ' + ev.venue : ''}</div>
                        </div>
                        <span className="ehd-status" style={{ color: badge.color, background: badge.background }}>{badge.label}</span>
                        <button className="eh-btn" onClick={(e) => { e.stopPropagation(); openMedia(ev.id) }}>Manage media</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="ehd-notices">
            <RecentNotices limit={5} title="Recent Notices" />
          </div>
        </>
      ) : null}
    </div>
  )
}
