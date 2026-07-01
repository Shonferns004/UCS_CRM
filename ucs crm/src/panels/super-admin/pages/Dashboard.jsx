import { useState, useEffect } from 'react'
import { getDashboard } from '../api/endpoints'

const MINT = '#3EB489'
const CORAL = '#FF7F50'
const PRIMARY = '#091426'

const ROLE_COLORS_MAP = {
  hoadmin: PRIMARY,
  accounts: MINT,
  leads: CORAL,
  recruiter: '#8b5cf6',
  telecaller: '#06b6d4',
  team_lead: '#f43f5e',
  hr: '#f97316',
}

const DEPT_DOT_COLORS = [PRIMARY, MINT, CORAL, '#8b5cf6', '#06b6d4', '#f43f5e', '#6366f1', '#f97316', '#14b8a6', '#ec4899']

const PERIODS = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
  { key: '1y', label: '1 Year' },
  { key: 'all', label: 'All Time' },
]

function Sparkline({ trend }) {
  let d
  if (trend === 'up') d = 'M0 35 Q 25 35, 50 20 T 100 5'
  else if (trend === 'down') d = 'M0 5 L 30 15 L 60 25 L 100 35'
  else d = 'M0 20 L 100 20'
  const color = trend === 'up' ? MINT : trend === 'down' ? CORAL : '#64748b'
  return (
    <svg className="sa-sparkline" viewBox="0 0 100 40">
      <path d={d} fill="none" stroke={color} strokeLinecap="round" strokeWidth="4" />
    </svg>
  )
}

function DonutChart({ segments, size, centerValue, centerLabel, animated }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) return null
  const r = 15.915
  let offset = 0
  return (
    <div className="sa-donut-wrap" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="sa-donut-svg">
        <circle cx="18" cy="18" fill="transparent" r={r} stroke="#f0f2f5" strokeWidth="3" />
        {segments.map((seg) => {
          const pct = (seg.value / total) * 100
          const dash = pct.toFixed(1)
          const gap = (100 - parseFloat(dash)).toFixed(1)
          const el = (
            <circle
              key={seg.label}
              cx="18" cy="18" fill="transparent" r={r}
              stroke={seg.color}
              strokeDasharray={animated ? `${dash} ${gap}` : `0 100`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
              strokeWidth="4.5"
              className="sa-donut-segment"
            />
          )
          offset += animated ? parseFloat(dash) : 0
          return el
        })}
      </svg>
      {(centerValue !== undefined || centerLabel) && (
        <div className="sa-donut-center">
          {centerValue !== undefined && <span className="sa-donut-center-value">{Number(centerValue).toLocaleString()}</span>}
          {centerLabel && <span className="sa-donut-center-label">{centerLabel}</span>}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [period, setPeriod] = useState('all')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [animated, setAnimated] = useState(false)

  useEffect(() => { const t = setTimeout(() => setAnimated(true), 150); return () => clearTimeout(t) }, [])

  useEffect(() => {
    setLoading(true)
    getDashboard(period)
      .then(d => setData(d))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false))
  }, [period])

  if (err) return <div className="sa-err-card">Error: {err}</div>
  if (!data) return (
    <div className="dash-page" style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'60vh'}}>
      <div style={{textAlign:'center'}}>
        <div className="loading" style={{marginBottom:8}}><div className="spinner" /></div>
        <div style={{fontSize:13,color:'var(--text-soft)'}}>Loading dashboard...</div>
      </div>
    </div>
  )

  const {
    stats = {}, deptWorkers = {}, roleDistribution = {}, ngoUserCounts = [],
    attendanceStatus = {},
    kpiChanges = {}, attendancePercent = 0,
    recentNotices = [], upcomingEvents = [],
  } = data

  const metricCards = [
    { label: 'Total NGOs', value: stats.totalNgos || 0, icon: 'corporate_fare', changeKey: 'totalNgos' },
    { label: 'Total Workers', value: stats.totalWorkers || 0, icon: 'badge', changeKey: 'totalWorkers' },
    { label: 'Total Users', value: stats.totalUsers || 0, icon: 'person', changeKey: '' },
    { label: 'Active Workers', value: stats.activeWorkers || 0, icon: 'bolt', changeKey: 'reach' },
    { label: 'Attendance %', value: attendancePercent, suffix: '%', icon: 'event_available', changeKey: 'attendancePercent' },
  ]

  function getTrend(changeKey) {
    if (changeKey === 'reach') return { direction: 'up', text: '100% Reach' }
    const v = kpiChanges[changeKey]
    if (v === undefined || v === null) return null
    if (v > 0) return { direction: 'up', text: `+${Math.abs(v)}%` }
    if (v < 0) return { direction: 'down', text: `-${Math.abs(v)}%` }
    return { direction: 'flat', text: 'Stable' }
  }

  const deptData = Object.entries(deptWorkers || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
  const maxDept = deptData.length > 0 ? deptData[0].value : 1

  const ngoChartData = (ngoUserCounts || []).slice(0, 10).map(n => ({
    name: n.name.length > 12 ? n.name.slice(0, 12) + '\u2026' : n.name,
    Users: n.users || 0,
    Workers: n.workers || 0,
  }))
  const maxNgo = Math.max(...ngoChartData.flatMap(n => [n.Users, n.Workers]), 1)

  const roleData = Object.entries(roleDistribution || {})
    .map(([name, value]) => ({
      name: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value,
      color: ROLE_COLORS_MAP[name] || '#64748b',
    }))
    .sort((a, b) => b.value - a.value)

  const attPresent = attendanceStatus?.present || 0
  const attLate = attendanceStatus?.late || 0
  const attAbsent = attendanceStatus?.absent || 0

  const attSegments = []
  if (attPresent > 0) attSegments.push({ label: 'Present', value: attPresent, color: MINT })
  if (attLate > 0) attSegments.push({ label: 'Late', value: attLate, color: '#FFD700' })
  if (attAbsent > 0) attSegments.push({ label: 'Absent', value: attAbsent, color: CORAL })

  const iconColors = [PRIMARY, MINT]

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h2 className="dash-header-title">Dashboard Overview</h2>
          <p className="dash-header-sub">Operational insights across all NGOs and departments.</p>
        </div>
        <div className="dash-header-actions">
          <div className="dash-period-bar">
            {PERIODS.map(p => (
              <button
                key={p.key}
                className={`dash-period-btn${period === p.key ? ' active' : ''}`}
                disabled={loading}
                onClick={() => setPeriod(p.key)}
              >
                {loading && period === p.key ? '\u25c9 ' : ''}{p.label}
              </button>
            ))}
          </div>
          <button className="btn btn-primary btn-sm">Export Report</button>
        </div>
      </div>

      <div className="metrics-grid">
        {metricCards.map((card, i) => {
          const trend = getTrend(card.changeKey)
          return (
            <div key={card.label} className="clay-card bouncy-appear" style={{ animationDelay: `${0.1 * (i + 1)}s` }}>
              <div className="clay-card-top">
                <span className="clay-card-label">{card.label}</span>
                <div className="clay-card-icon-wrap">
                  <span className="material-symbols-outlined">{card.icon}</span>
                </div>
              </div>
              <div className="clay-card-body">
                <span className="clay-card-value">
                  {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}{card.suffix || ''}
                </span>
                {trend && (
                  <div className="clay-card-trend">
                    <Sparkline trend={trend.direction} />
                    <span className={`clay-card-trend-text trend-${trend.direction}`}>
                      {trend.direction !== 'flat' && (
                        <span className="material-symbols-outlined">
                          {trend.direction === 'up' ? 'trending_up' : 'trending_down'}
                        </span>
                      )}
                      {trend.text}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="dash-grid">
        <div className="dash-grid-main">
          <div className="clay-card dash-card-section bouncy-appear" style={{ animationDelay: '0.6s' }}>
            <div className="clay-section-header">
              <h3 className="clay-section-title">Workers by Department</h3>
              <div className="clay-section-more">
                <span className="material-symbols-outlined">more_horiz</span>
              </div>
            </div>
            {deptData.length === 0 ? (
              <p className="dash-muted">No department data</p>
            ) : (
              <div className="dept-progress-list">
                {deptData.map((d, i) => (
                  <div key={d.name} className="dept-progress-item">
                    <div className="dept-progress-header">
                      <span className="dept-progress-name">
                        <span className="dept-progress-dot" style={{ background: DEPT_DOT_COLORS[i % DEPT_DOT_COLORS.length] }} />
                        {d.name}
                      </span>
                      <span className="dept-progress-count">{d.value} Workers</span>
                    </div>
                    <div className="dept-progress-track">
                      <div
                        className="dept-progress-fill"
                        style={{
                          width: animated ? `${(d.value / maxDept) * 100}%` : '0%',
                          background: DEPT_DOT_COLORS[i % DEPT_DOT_COLORS.length],
                          transitionDelay: `${i * 0.12}s`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="clay-card dash-card-section bouncy-appear" style={{ animationDelay: '0.7s' }}>
            <div className="clay-section-header">
              <h3 className="clay-section-title">NGOs \u2014 Users & Workers</h3>
              <div className="clay-section-legend">
                <span className="clay-legend-item">
                  <span className="clay-legend-swatch" style={{ background: PRIMARY }} />
                  Users
                </span>
                <span className="clay-legend-item">
                  <span className="clay-legend-swatch" style={{ background: MINT }} />
                  Workers
                </span>
              </div>
            </div>
            {ngoChartData.length === 0 ? (
              <p className="dash-muted">No NGO data</p>
            ) : (
              <div className="ngo-bar-chart">
                {ngoChartData.map((n, i) => (
                  <div key={n.name} className="ngo-bar-group">
                    <div className="ngo-bars">
                      <div
                        className="ngo-bar ngo-bar-users"
                        style={{
                          height: animated ? `${(n.Users / maxNgo) * 100}%` : '0%',
                          transitionDelay: `${0.3 + i * 0.08}s`,
                        }}
                      />
                      <div
                        className="ngo-bar ngo-bar-workers"
                        style={{
                          height: animated ? `${(n.Workers / maxNgo) * 100}%` : '0%',
                          transitionDelay: `${0.3 + i * 0.08}s`,
                        }}
                      />
                    </div>
                    <span className="ngo-bar-label">{n.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="dash-grid-side">
          <div className="clay-card dash-card-section bouncy-appear" style={{ animationDelay: '0.8s' }}>
            <h3 className="clay-section-title">Role Distribution</h3>
            {roleData.length === 0 ? (
              <p className="dash-muted">No user data</p>
            ) : (
              <div className="sa-pie-wrap">
                <DonutChart
                  segments={roleData}
                  size={180}
                  centerValue={roleData.reduce((s, r) => s + r.value, 0)}
                  centerLabel="Active"
                  animated={animated}
                />
                <div className="sa-pie-legend">
                  {roleData.map(r => (
                    <div key={r.name} className="sa-pie-legend-item">
                      <span className="sa-pie-dot" style={{ background: r.color }} />
                      <span className="sa-pie-label">{r.name}</span>
                      <span className="sa-pie-value">{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="clay-card dash-card-section bouncy-appear" style={{ animationDelay: '0.9s' }}>
            <h3 className="clay-section-title">Daily Check-ins</h3>
            {attSegments.length === 0 ? (
              <p className="dash-muted">No attendance data</p>
            ) : (
              <div className="sa-checkins-wrap">
                <DonutChart segments={attSegments} size={160} animated={animated} />
                <div className="sa-checkins-list">
                  {attSegments.map((s, i) => (
                    <div
                      key={s.label}
                      className={`sa-checkin-item${animated ? ' sa-checkin-show' : ''}`}
                      style={{
                        background: s.label === 'Present' ? 'rgba(62,180,137,0.08)' : s.label === 'Late' ? 'rgba(255,215,0,0.08)' : 'rgba(255,127,80,0.08)',
                        borderColor: s.label === 'Present' ? 'rgba(62,180,137,0.2)' : s.label === 'Late' ? 'rgba(255,215,0,0.2)' : 'rgba(255,127,80,0.2)',
                        transitionDelay: `${0.3 + i * 0.12}s`,
                      }}
                    >
                      <div className="sa-checkin-icon-wrap" style={{
                        background: s.label === 'Present' ? 'rgba(62,180,137,0.15)' : s.label === 'Late' ? 'rgba(255,215,0,0.15)' : 'rgba(255,127,80,0.15)',
                      }}>
                        <span className="material-symbols-outlined" style={{ color: s.color }}>
                          {s.label === 'Present' ? 'verified' : s.label === 'Late' ? 'pace' : 'cancel'}
                        </span>
                      </div>
                      <span className="sa-checkin-label">{s.label}</span>
                      <span className="sa-checkin-count">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="clay-card dash-card-section bouncy-appear" style={{ animationDelay: '1.0s' }}>
            <div className="clay-section-header">
              <h3 className="clay-section-title">Recent Notices</h3>
              <a className="clay-section-link" href="#">VIEW ALL</a>
            </div>
            {recentNotices.length === 0 ? (
              <p className="dash-muted">No recent notices</p>
            ) : (
              <div className="sa-notice-list">
                {recentNotices.slice(0, 2).map((n, i) => (
                  <div key={n.id} className="sa-notice-item">
                    <div className="sa-notice-icon" style={{ background: iconColors[i % iconColors.length] }}>
                      <span className="material-symbols-outlined" style={{ color: '#fff' }}>
                        {i % 2 === 0 ? 'priority_high' : 'verified_user'}
                      </span>
                    </div>
                    <div className="sa-notice-body">
                      <h4 className="sa-notice-title">{n.title}</h4>
                      <p className="sa-notice-text">
                        {n.content && n.content.length > 120 ? n.content.slice(0, 120) + '\u2026' : n.content || ''}
                      </p>
                      <span className="sa-notice-time">
                        {new Date(n.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="clay-card dash-card-section bouncy-appear" style={{ animationDelay: '1.1s' }}>
            <h3 className="clay-section-title">Upcoming Events</h3>
            {upcomingEvents.length === 0 ? (
              <p className="dash-muted">No upcoming events</p>
            ) : (
              <>
                <div className="sa-event-list">
                  {upcomingEvents.slice(0, 2).map(ev => {
                    const d = new Date(ev.event_date)
                    return (
                      <div key={ev.id} className="sa-event-item">
                        <div className="sa-event-date">
                          <span className="sa-event-mon">{d.toLocaleString('en-IN', { month: 'short' })}</span>
                          <span className="sa-event-day">{d.getDate()}</span>
                        </div>
                        <div className="sa-event-body">
                          <h4 className="sa-event-title">{ev.title}</h4>
                          <p className="sa-event-meta">
                            {ev.location && <span>{ev.location}</span>}
                            {ev.event_time && <span> \u2022 {ev.event_time.slice(0, 5)}</span>}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <button className="sa-event-add-btn">ADD NEW EVENT</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
