import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchDashboardStats, fetchDashboardOptions } from '../store'
import { PageHeader, MetricCard, SectionCard, SearchInput, StatusPill, Empty } from '../components/ui'
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

  const actions = (
    <>
      <button className="eh-btn eh-btn-primary" onClick={() => navigate('/event-head/create')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Create Event
      </button>
      <button className="eh-btn" onClick={() => navigate('/event-head/activities')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Activity
      </button>
      <button className="eh-btn" onClick={() => navigate('/event-head/monthly-planner')}>View Calendar <Caret /></button>
    </>
  )

  return (
    <>
      <PageHeader
        title="Event Management Overview"
        subtitle={stats?.generated_at
          ? `Updated ${new Date(stats.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · all data from Event Head workspace`
          : 'Digital Team operational workspace'}
        actions={actions}
      />

      <div className="eh-toolbar">
        <SearchInput placeholder="Filter by NGO, sector or activity…" value="" onChange={() => {}} style={{ maxWidth: 420 }} />
        <select className="eh-select" value={ngoFilter} onChange={e => onNgo(e.target.value)}>
          <option value="">All NGOs</option>
          {ngos.map(n => <option key={n.id} value={n.id}>{n.name || n.code}</option>)}
        </select>
        <select className="eh-select" value={month} onChange={e => setMonth(e.target.value)}>
          <option value="">All Months</option>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select className="eh-select" value={year} onChange={e => setYear(e.target.value)}>
          <option value="">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="eh-select" value={sectorFilter} onChange={e => onSector(e.target.value)} disabled={!ngoFilter && relevantSectors.length === 0}>
          <option value="">All Sectors</option>
          {relevantSectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="eh-select" value={activityFilter} onChange={e => setActivityFilter(e.target.value)} disabled={!sectorFilter || relevantActivities.length === 0}>
          <option value="">All Activities</option>
          {relevantActivities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {error && (
        <div className="eh-section" style={{ borderLeft: '3px solid var(--eh-danger)', marginBottom: 16 }}>
          <div className="eh-row" style={{ padding: '14px 18px', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--eh-danger)', fontWeight: 600 }}>Unable to load dashboard data.</span>
            {error && error !== 'Unable to load dashboard data.' && (
              <span style={{ fontSize: 12, color: 'var(--eh-ink-soft)', flex: 1, minWidth: 160 }}>{error}</span>
            )}
            <button className="eh-btn eh-btn-primary" onClick={() => { setError(null); setLoading(true); fetchDashboardStats({
              ngo_id: ngoFilter || undefined, sector_id: sectorFilter || undefined,
              activity_id: activityFilter || undefined, month: month || undefined, year: year || undefined,
            }).then(d => setStats(d || null)).catch(e => setError(e && e.message ? e.message : 'Unable to load dashboard data.')).finally(() => setLoading(false)) }}>
              Retry
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--eh-ink-soft)' }}>Loading dashboard…</div>
      ) : !error && stats ? (
        <>
          <div className="eh-metrics">
            <MetricCard index={0} number={k.total_events ?? 0} label="Total Events"
              icon={<Icon path={<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>} />}
              color="var(--eh-primary)" />
            <MetricCard index={1} number={'₹' + (k.budget_total ?? 0).toLocaleString()} label="Budget Total"
              icon={<Icon path={<><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9.5 9.5c0-.8.6-1.5 2.5-1.5 2 0 2.5.7 2.5 1.7 0 2.8-5 1.6-5 4.3 0 .8.6 1.5 2.5 1.5 1.9 0 2.5-.7 2.5-1.5"/></>} />}
              color="var(--eh-success)" />
            <MetricCard index={2} number={(k.beneficiaries_total ?? 0).toLocaleString()} label="Beneficiaries"
              icon={<Icon path={<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>} />}
              color="var(--eh-secondary)" />
            <MetricCard index={3} number={stats.this_month?.total ?? 0} label="Events This Month"
              icon={<Icon path={<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>} />}
              color="#eab308" />
          </div>

          <div className="eh-grid-2">
            <SectionCard title="Calendar Preview" headRight={<button className="eh-btn" onClick={() => navigate('/event-head/monthly-planner')}>Open Calendar</button>}>
              {(stats.this_week?.events || []).slice(0, 4).length === 0 ? (
                <Empty>No events this week.</Empty>
              ) : (
                <div>
                  {(stats.this_week?.events || []).slice(0, 4).map(ev => (
                    <div key={ev.id} onClick={() => open(ev.id)}
                      className="eh-row"
                      style={{ padding: '10px 14px', borderBottom: '1px solid var(--eh-line)', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--eh-tint-1)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ width: 46, flexShrink: 0, textAlign: 'center', background: 'var(--eh-tint-1)', borderRadius: 10, padding: '4px 0', border: '1px solid var(--eh-line)' }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--eh-ink-faint)', fontWeight: 700 }}>{fmtDay(ev.date)}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--eh-primary)' }}>{fmtDate(ev.date).split(' ')[0]}</div>
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--eh-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.name || 'Untitled'}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--eh-ink-soft)' }}>{[ev.ngo_name, ev.sector_name].filter(Boolean).join(' · ')}</div>
                      </div>
                      <StatusPill status={ev.status} />
                    </div>
                  ))}
                  <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--eh-ink-soft)' }}>
                    {stats.this_week?.count || 0} events this week total · <button className="eh-btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => navigate('/event-head/monthly-planner')}>Monthly Planner</button>
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard title="This Month"
              headRight={<div className="eh-m-icon" style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--eh-primary-soft)', color: 'var(--eh-primary)', fontSize: 12, fontWeight: 700 }}>{MONTHS[new Date().getMonth()]}</div>}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--eh-primary)' }}>{stats.this_month?.total ?? 0}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--eh-ink-soft)' }}>Total events</div>
                </div>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: '#eab308' }}>{stats.this_month?.upcoming ?? 0}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--eh-ink-soft)' }}>Upcoming</div>
                </div>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--eh-success)' }}>{stats.this_month?.completed ?? 0}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--eh-ink-soft)' }}>Completed</div>
                </div>
              </div>
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--eh-line)', fontSize: 12, color: 'var(--eh-ink-soft)' }}>
                {['Total scheduled', 'Not done yet', 'Delivered this month'].join(' · ')}
              </div>
            </SectionCard>
          </div>

          <div className="eh-grid-2">
            <SectionCard title="Events by NGO" sub="Updates with Sector / Month filters">
              {(stats.events_by_ngo || []).length === 0 ? (
                <Empty>No NGO data available.</Empty>
              ) : (
                <div style={{ padding: '12px 16px 16px' }}>
                  {(stats.events_by_ngo || []).map(n => (
                    <div key={n.ngo_id} onClick={() => navigate(`/event-head/sectors?ngo=${n.ngo_id}`)}
                      title={`Open ${n.ngo_name || ''} programs (Sector → Activity → Event)`}
                      style={{ padding: '10px 0', borderBottom: '1px solid var(--eh-line)', cursor: 'pointer', opacity: ngoFilter && String(n.ngo_id) !== String(ngoFilter) ? 0.5 : 1, transition: 'background .15s, opacity .15s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--eh-tint-1)'; e.currentTarget.style.paddingLeft = '8px' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.paddingLeft = '0' }}>
                      <div className="eh-row" style={{ justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--eh-ink)' }}>{n.ngo_name || '—'}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--eh-secondary)' }}>{n.count} ›</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 99, background: 'var(--eh-line)', overflow: 'hidden', marginTop: 6 }}>
                        <div style={{ height: '100%', width: `${Math.round((n.count / maxNgoCount) * 100)}%`, background: 'linear-gradient(90deg,var(--eh-primary),var(--eh-secondary))', borderRadius: 99, transition: 'width .3s' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Events by Sector" headRight={<button className="eh-btn" onClick={() => navigate('/event-head/sectors')}>Manage Sectors</button>}>
              {(stats.events_by_sector || []).length === 0 ? (
                <Empty>No sector data available.</Empty>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, paddingTop: 4 }}>
                  {(stats.events_by_sector || []).map(s => {
                    const active = sectorFilter && String(s.id) === String(sectorFilter)
                    return (
                      <div key={s.id} onClick={() => navigate(`/event-head/activities?sector=${s.id}`)}
                        style={{ border: '1px solid var(--eh-line)', borderRadius: 14, padding: '12px 14px', cursor: 'pointer', background: active ? 'var(--eh-primary-soft)' : 'var(--eh-surface-2)', transition: 'border-color .15s, transform .15s, box-shadow .15s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--eh-secondary)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--eh-line)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}>
                        <div className="eh-row" style={{ justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--eh-ink)', lineHeight: 1.3 }}>{s.name} {active && <StatusPill status="active" />}</span>
                        </div>
                        <div className="eh-row" style={{ marginTop: 8, gap: 14 }}>
                          <span style={{ fontSize: 12, color: 'var(--eh-ink-soft)' }}><b style={{ color: 'var(--eh-primary)' }}>{s.activity_count ?? 0}</b> activities</span>
                          <span style={{ fontSize: 12, color: 'var(--eh-ink-soft)' }}><b style={{ color: 'var(--eh-secondary)' }}>{s.event_count ?? 0}</b> events</span>
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
                <Empty>No activities have upcoming events.</Empty>
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
                          <td><span className="eh-badge" style={{ background: 'var(--eh-primary-soft)', color: 'var(--eh-primary)' }}>{a.upcoming_count}</span></td>
                          <td>{fmtDate(a.next_event_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Events Needing Attention" headRight={<span style={{ fontSize: 12, color: 'var(--eh-ink-faint)' }}>{stats.attention?.length || 0} items</span>}>
              {(stats.attention || []).length === 0 ? (
                <Empty>All events are in good shape.</Empty>
              ) : (
                <div>
                  {(stats.attention || []).map(ev => (
                    <div key={ev.id} onClick={() => open(ev.id)}
                      className="eh-row"
                      style={{ alignItems: 'flex-start', padding: '10px 14px', borderBottom: '1px solid var(--eh-line)', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--eh-tint-1)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: ev.attention_type === 'overdue' ? 'var(--eh-danger)' : ev.attention_type === 'info' ? 'var(--eh-primary)' : '#eab308' }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--eh-ink)' }}>{ev.name || 'Untitled'}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--eh-ink-soft)', marginTop: 1 }}>{fmtDate(ev.date)}{ev.venue ? ' · ' + ev.venue : ''}</div>
                      </div>
                      <span className="eh-badge" style={{ background: ev.attention_type === 'overdue' ? 'var(--eh-danger-soft)' : ev.attention_type === 'info' ? 'var(--eh-primary-soft)' : 'var(--eh-warn-soft)', color: ev.attention_type === 'overdue' ? 'var(--eh-danger)' : ev.attention_type === 'info' ? 'var(--eh-primary)' : '#9a8200', whiteSpace: 'nowrap' }}>{ev.attention_reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <div style={{ marginBottom: 18 }}>
            <RecentNotices limit={5} title="Recent Notices" />
          </div>
        </>
      ) : null}
    </>
  )
}