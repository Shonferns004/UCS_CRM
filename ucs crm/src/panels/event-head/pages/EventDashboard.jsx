import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchDashboardStats, fetchDashboardOptions } from '../store'
import { StatCard } from '../components/Table'
import RecentNotices from '../../../components/RecentNotices'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const TODAY_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const statusColor = (s) => {
  const map = { Completed: 'green', Approved: 'blue', Draft: 'gray', Submitted: 'yellow', Rejected: 'red', Cancelled: 'red', Closed: 'green', Postponed: 'yellow' }
  return map[s] || 'gray'
}

const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return String(d).slice(0, 10)
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

const fmtDay = (d) => { if (!d) return ''; const dt = new Date(d); return isNaN(dt.getTime()) ? '' : TODAY_WEEKDAYS[dt.getDay()] }

const fmtTime = (t) => { if (!t) return '—'; const s = String(t); return s.length >= 5 ? s.slice(0, 5) : s }

function EmptyNote({ children }) {
  return (
    <div style={{ textAlign: 'center', padding: '26px 14px', color: 'var(--ink-soft)', fontSize: 13 }}>
      {children}
    </div>
  )
}

function Caret() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: '-2px' }}><polyline points="9 18 15 12 9 6" /></svg>
}

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

  const k = stats?.kpis || {}
  const maxNgoCount = Math.max(1, ...(stats?.events_by_ngo || []).map(n => n.count))
  const maxSectorCount = Math.max(1, ...(stats?.events_by_sector || []).map(s => s.event_count))

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 17, margin: 0 }}>Event Management Dashboard</h3>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
            {stats?.generated_at
              ? `Updated ${new Date(stats.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · all data from Event Head workspace`
              : 'Digital Team operational workspace'}
          </div>
        </div>
      </div>

      <div className="filter-bar" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={ngoFilter} onChange={e => onNgo(e.target.value)}>
          <option value="">All NGOs</option>
          {ngos.map(n => <option key={n.id} value={n.id}>{n.name || n.code}</option>)}
        </select>
        <select value={month} onChange={e => setMonth(e.target.value)}>
          <option value="">All Months</option>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(e.target.value)}>
          <option value="">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={sectorFilter} onChange={e => onSector(e.target.value)} disabled={!ngoFilter && relevantSectors.length === 0}>
          <option value="">All Sectors</option>
          {relevantSectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={activityFilter} onChange={e => setActivityFilter(e.target.value)} disabled={!sectorFilter || relevantActivities.length === 0}>
          <option value="">All Activities</option>
          {relevantActivities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => navigate('/event-head/create')}>+ Create Event</button>
        <button className="btn" onClick={() => navigate('/event-head/activities')}>+ Add Activity</button>
        <button className="btn" onClick={() => navigate('/event-head/monthly-planner')}>View Calendar <Caret /></button>
      </div>

      {error && (
        <div className="card" style={{ borderLeft: '3px solid #ef4444', marginBottom: 16 }}>
          <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ color: '#ef4444', fontWeight: 600 }}>Unable to load dashboard data.</span>
            {error && error !== 'Unable to load dashboard data.' && (
              <span style={{ fontSize: 12, color: 'var(--ink-soft)', flex: 1, minWidth: 160 }}>{error}</span>
            )}
            <button className="btn btn-sm" onClick={() => { setError(null); setLoading(true); fetchDashboardStats({
              ngo_id: ngoFilter || undefined, sector_id: sectorFilter || undefined,
              activity_id: activityFilter || undefined, month: month || undefined, year: year || undefined,
            }).then(d => setStats(d || null)).catch(e => setError(e && e.message ? e.message : 'Unable to load dashboard data.')).finally(() => setLoading(false)) }}>
              Retry
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading" style={{ padding: 60, textAlign: 'center', color: 'var(--ink-soft)' }}>Loading dashboard...</div>
      ) : !error && stats ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
            <StatCard icon={null} label="Total Events" value={k.total_events ?? 0} color="#7B5EA7" subtitle="All filtered events" />
            <StatCard icon={null} label="Budget Total" value={'₹' + (k.budget_total ?? 0).toLocaleString()} color="#16a34a" subtitle="Across filtered events" />
            <StatCard icon={null} label="Beneficiaries" value={(k.beneficiaries_total ?? 0).toLocaleString()} color="#7c3aed" subtitle="Expected across events" />
          </div>

          <div style={{ display: 'grid', gap: 16, alignContent: 'start', minWidth: 0 }}>
              <div className="card">
                <div className="card-head">
                  <h3>Calendar Preview</h3>
                  <button className="btn btn-sm" onClick={() => navigate('/event-head/monthly-planner')}>Open Calendar</button>
                </div>
                {(stats.this_week?.events || []).slice(0, 4).length === 0 ? (
                  <EmptyNote>No events this week.</EmptyNote>
                ) : (
                  <div>
                    {(stats.this_week?.events || []).slice(0, 4).map(ev => (
                      <div key={ev.id} onClick={() => open(ev.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <div style={{ width: 46, flexShrink: 0, textAlign: 'center', background: 'var(--bg, #f1f5f9)', borderRadius: 8, padding: '4px 0' }}>
                          <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 700 }}>{fmtDay(ev.date)}</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{fmtDate(ev.date).split(' ')[0]}</div>
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.name || 'Untitled'}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{[ev.ngo_name, ev.sector_name].filter(Boolean).join(' · ')}</div>
                        </div>
                        <span className={`pill pill-${statusColor(ev.status)}`}>{ev.status || '—'}</span>
                      </div>
                    ))}
                    <div className="card-pad" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                      {stats.this_week?.count || 0} events this week total · <button className="btn btn-sm" onClick={() => navigate('/event-head/monthly-planner')}>Monthly Planner</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="card">
                <div className="card-head"><h3>This Week</h3><span className="pill pill-blue">{stats.this_week?.count || 0} events</span></div>
                {(stats.this_week?.events || []).length === 0 ? (
                  <EmptyNote>No events scheduled this week.</EmptyNote>
                ) : (
                  <div>
                    {(stats.this_week?.events || []).slice(0, 5).map(ev => (
                      <div key={ev.id} onClick={() => open(ev.id)}
                        style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--line)', cursor: 'pointer', fontSize: 12.5 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <span style={{ color: 'var(--ink)', fontWeight: 500, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.name || 'Untitled'}</span>
                        <span style={{ color: 'var(--ink-soft)', flexShrink: 0 }}>{fmtDay(ev.date)} · {fmtDate(ev.date)}</span>
                      </div>
))}
                  </div>
                )}
              </div>
            </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
            <div className="card">
              <div className="card-head">
                <h3>Events by NGO</h3>
                <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>updates with Sector / Month filters</span>
              </div>
              {(stats.events_by_ngo || []).length === 0 ? (
                <EmptyNote>No NGO data available.</EmptyNote>
              ) : (
                <div style={{ padding: '6px 16px 16px' }}>
                  {(stats.events_by_ngo || []).map(n => (
                    <div key={n.ngo_id} onClick={() => navigate(`/event-head/sectors?ngo=${n.ngo_id}`)}
                      title={`Open ${n.ngo_name || ''} programs (Sector → Activity → Event)`}
                      style={{ padding: '10px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer', opacity: ngoFilter && String(n.ngo_id) !== String(ngoFilter) ? 0.5 : 1, transition: 'background .15s, opacity .15s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.paddingLeft = '8px' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.paddingLeft = '0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{n.ngo_name || '—'}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#7B5EA7' }}>{n.count} <span style={{ color: '#7B5EA7', verticalAlign: '-1px' }}>›</span></span>
                      </div>
                      <div style={{ height: 6, borderRadius: 99, background: 'var(--line)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.round((n.count / maxNgoCount) * 100)}%`, background: '#7B5EA7', borderRadius: 99, transition: 'width .3s' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-head"><h3>This Month</h3><span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{MONTHS[new Date().getMonth()]} {new Date().getFullYear()}</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, padding: '14px 16px 16px' }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#7B5EA7' }}>{stats.this_month?.total ?? 0}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Total events</div>
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#3485D4' }}>{stats.this_month?.upcoming ?? 0}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Upcoming</div>
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#5B6B4E' }}>{stats.this_month?.completed ?? 0}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Completed</div>
                </div>
              </div>
              <div className="card-pad" style={{ borderTop: '1px solid var(--line)', fontSize: 12, color: 'var(--ink-soft)' }}>
                {['Total scheduled', 'Not done yet', 'Delivered this month'].join(' · ')}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <h3>Events by Sector</h3>
              <button className="btn btn-sm" onClick={() => navigate('/event-head/sectors')}>Manage Sectors</button>
            </div>
            {(stats.events_by_sector || []).length === 0 ? (
              <EmptyNote>No sector data available.</EmptyNote>
            ) : (
              <div className="card-pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, paddingTop: 14 }}>
                {(stats.events_by_sector || []).map(s => {
                  const active = sectorFilter && String(s.id) === String(sectorFilter)
                  return (
                    <div key={s.id} onClick={() => navigate(`/event-head/activities?sector=${s.id}`)}
                      style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer', background: active ? '#f5f0fb' : 'transparent', transition: 'border-color .15s, transform .15s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#7B5EA7'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.transform = 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>{s.name} {active && <span className="pill pill-blue" style={{ marginLeft: 4 }}>active</span>}</span>
                      </div>
                      <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}><b style={{ color: '#3485D4' }}>{s.activity_count ?? 0}</b> activities</span>
                        <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}><b style={{ color: '#7B5EA7' }}>{s.event_count ?? 0}</b> events</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 16 }}>
            <div className="card" style={{ minWidth: 0 }}>
              <div className="card-head"><h3>Activities with Upcoming Events</h3></div>
              {(stats.activities_with_upcoming_events || []).length === 0 ? (
                <EmptyNote>No activities have upcoming events.</EmptyNote>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr><th>Activity</th><th>Sector</th><th>NGO</th><th>Upcoming</th><th>Next Event</th></tr>
                    </thead>
                    <tbody>
                      {(stats.activities_with_upcoming_events || []).slice(0, 8).map(a => (
                        <tr key={a.activity_id} style={{ cursor: 'pointer' }} onClick={() => navigate('/event-head/activities/' + a.activity_id)}>
                          <td style={{ fontWeight: 500 }}>{a.activity_name}</td>
                          <td>{a.sector_name || '—'}</td>
                          <td>{a.ngo_name || 'All NGOs'}</td>
                          <td><span className="pill pill-blue">{a.upcoming_count}</span></td>
                          <td>{fmtDate(a.next_event_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card" style={{ minWidth: 0 }}>
              <div className="card-head"><h3>Events Needing Attention</h3><span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{stats.attention?.length || 0} items</span></div>
              {(stats.attention || []).length === 0 ? (
                <EmptyNote>All events are in good shape.</EmptyNote>
              ) : (
                <div>
                  {(stats.attention || []).map(ev => (
                    <div key={ev.id} onClick={() => open(ev.id)}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: ev.attention_type === 'overdue' ? '#ef4444' : ev.attention_type === 'info' ? '#3b82f6' : '#eab308' }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{ev.name || 'Untitled'}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 1 }}>{fmtDate(ev.date)}{ev.venue ? ' · ' + ev.venue : ''}</div>
                      </div>
                      <span className="pill" style={{ background: ev.attention_type === 'overdue' ? '#fee2e2' : ev.attention_type === 'info' ? '#dbeafe' : '#fef3c7', color: ev.attention_type === 'overdue' ? '#dc2626' : ev.attention_type === 'info' ? '#1d4ed8' : '#b45309', whiteSpace: 'nowrap' }}>{ev.attention_reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <RecentNotices limit={5} title="Recent Notices" />
        </>
      ) : null}
    </>
  )
}