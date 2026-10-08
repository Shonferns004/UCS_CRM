import { useMemo } from 'react'
import {
  Users, Clock, ShieldCheck, BadgeCheck, IndianRupee, FileText, ArrowRight,
  AlertTriangle, Timer, CircleCheck, CalendarClock, TrendingUp, TrendingDown
} from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts'
import StatCard from './StatCard.jsx'
import {
  statusLabel, statusMeta, STATUS_ORDER, PIPELINE_STAGES,
  PLAN_COLORS, CHART_COLORS, daysUntil, toLocalIso
} from './meta.js'
import { formatINR } from './formUtils.js'
import { AppliedDate, RenewalDate } from './DateTags.jsx'

const inLastDays = (iso, days) => {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return Number.isFinite(t) && t >= Date.now() - days * 86400000
}

export default function Dashboard({ rows, onOpen, onDrill }) {
  const drill = onDrill || (() => {})

  const stats = useMemo(() => {
    const count = (s) => rows.filter((r) => r.status === s).length
    const total = rows.length
    const pending = count('SUBMITTED')
    const awaiting = count('PAYMENT_SUBMITTED')
    const verified = count('VERIFIED')
    const approved = count('APPROVED')
    const rejected = count('REJECTED')
    const revenue = rows
      .filter((r) => r.status === 'VERIFIED' || r.status === 'APPROVED')
      .reduce(
        (s, r) => s + (Number(r.membership_fee) || 0) + (Number(r.renewal_fees) || 0),
        0
      )
    const newThisWeek = (s) =>
      rows.filter((r) => r.status === s && inLastDays(r.created_at, 7)).length
    const monthKey = (offset = 0) => {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() + offset)
      return toLocalIso(d).slice(0, 7)
    }
    const monthRevenue = (ym) =>
      rows
        .filter(
          (r) =>
            (r.status === 'VERIFIED' || r.status === 'APPROVED') &&
            (r.created_at || '').slice(0, 7) === ym
        )
        .reduce((s, r) => s + (Number(r.membership_fee) || 0), 0)
    const thisMonth = monthRevenue(monthKey(0))
    const lastMonth = monthRevenue(monthKey(-1))
    const revDelta =
      lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null

    const newTotal = rows.filter((r) => inLastDays(r.created_at, 7)).length
    const approvedEnds = rows
      .filter((r) => r.status === 'APPROVED' && r.end_date)
      .map((r) => daysUntil(r.end_date))
      .filter((d) => d !== null)
    const expiringSoon = approvedEnds.filter((d) => d >= 0 && d <= 30).length
    const expired = approvedEnds.filter((d) => d < 0).length

    return {
      total, pending, awaiting, verified, approved, rejected, revenue,
      newThisWeek, newTotal, thisMonth, lastMonth, revDelta, expiringSoon, expired
    }
  }, [rows])

  const daily = useMemo(() => {
    const days = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      days.push({
        key: d.toDateString(),
        iso: toLocalIso(d),
        day: d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
        count: 0
      })
    }
    const byKey = new Map(days.map((x) => [x.key, x]))
    rows.forEach((r) => {
      if (r.created_at) {
        const e = byKey.get(new Date(r.created_at).toDateString())
        if (e) e.count += 1
      }
    })
    return days
  }, [rows])

  const statusMix = useMemo(
    () =>
      STATUS_ORDER.map((s) => ({
        status: s,
        name: statusLabel(s),
        value: rows.filter((r) => r.status === s).length
      })).filter((d) => d.value > 0),
    [rows]
  )

  const plans = useMemo(() => {
    const map = new Map()
    rows.forEach((r) => {
      const p = r.membership_type || 'Other'
      map.set(p, (map.get(p) || 0) + 1)
    })
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [rows])

  const monthly = useMemo(() => {
    const map = new Map()
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() - i)
      const iso = toLocalIso(d).slice(0, 7)
      map.set(iso, { iso, month: iso.slice(5), revenue: 0 })
    }
    rows.forEach((r) => {
      if (r.created_at && (r.status === 'VERIFIED' || r.status === 'APPROVED')) {
        const k = r.created_at.slice(0, 7)
        const bucket = map.get(k)
        if (bucket) bucket.revenue += Number(r.membership_fee) || 0
      }
    })
    return Array.from(map.values()).map((v) => ({ ...v, revenue: Math.round(v.revenue) }))
  }, [rows])

  const pct = (n) => (stats.total ? Math.round((n / stats.total) * 100) : 0)
  const approvalRate = stats.total
    ? Math.round((stats.approved / stats.total) * 100)
    : 0

  const funnelStages = PIPELINE_STAGES.map((s) => ({
    status: s,
    label: statusLabel(s),
    meta: statusMeta(s),
    count: s === 'SUBMITTED' ? stats.pending : s === 'PAYMENT_SUBMITTED' ? stats.awaiting : s === 'VERIFIED' ? stats.verified : stats.approved
  }))

  const recent = rows.slice(0, 6)

  const expiringList = useMemo(
    () =>
      rows
        .filter((r) => {
          if (r.status !== 'APPROVED' || !r.end_date) return false
          const d = daysUntil(r.end_date)
          return d !== null && d >= 0 && d <= 30
        })
        .sort((a, b) => (daysUntil(a.end_date) ?? 0) - (daysUntil(b.end_date) ?? 0)),
    [rows]
  )

  const tooltipStyle = {
    borderRadius: 8,
    border: '1px solid #dadce0',
    fontSize: 12.5,
    boxShadow: '0 4px 14px rgba(0,0,0,.08)'
  }

  const monthRange = (ym) => {
    const [y, m] = ym.split('-').map(Number)
    const last = new Date(y, m, 0).getDate()
    return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` }
  }

  return (
    <div className="admin-view">
      <div className="admin-view-head">
        <div>
          <h2>Dashboard</h2>
          <p className="admin-sub">Overview of membership applications · click any card to open the filtered list</p>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard
          icon={<Users size={20} />} label="Total applications" value={stats.total}
          color="#0ea5e9" dot pct={pct(stats.total)}
          sub={`${stats.newTotal} new this week`}
          onClick={() => drill({})}
        />
        <StatCard
          icon={<Clock size={20} />} label="Payment pending" value={stats.pending}
          color="#f59e0b" dot pct={pct(stats.pending)}
          sub={`${stats.newThisWeek('SUBMITTED')} new this week`}
          onClick={() => drill({ status: 'SUBMITTED' })}
        />
        <StatCard
          icon={<ShieldCheck size={20} />} label="Awaiting verification" value={stats.awaiting}
          color="#3b82f6" dot pct={pct(stats.awaiting)}
          sub={`${stats.newThisWeek('PAYMENT_SUBMITTED')} new this week`}
          onClick={() => drill({ status: 'PAYMENT_SUBMITTED' })}
        />
        <StatCard
          icon={<BadgeCheck size={20} />} label="Approved members" value={stats.approved}
          color="#22c55e" dot pct={pct(stats.approved)}
          sub={`${stats.verified} verified · ${stats.rejected} rejected`}
          onClick={() => drill({ status: 'APPROVED' })}
        />
        <StatCard
          icon={<IndianRupee size={20} />} label="Revenue collected" value={stats.revenue}
          color="#8b5cf6"
          sub={formatINR(stats.revenue)}
          trend={
            stats.revDelta !== null
              ? {
                  up: stats.revDelta >= 0,
                  label: `${Math.abs(stats.revDelta)}% vs last month`,
                  color: stats.revDelta >= 0 ? '#15803d' : '#b91c1c'
                }
              : { label: `${formatINR(stats.thisMonth)} this month`, color: '#5f6368' }
          }
        />
      </div>

      {expiringList.length > 0 && (
        <div className="chart-card expiry-alert">
          <div className="recent-head">
            <h3 className="chart-title">
              <AlertTriangle size={16} /> Expiring soon
              <small className="chart-hint">
                {expiringList.length} ending within 30 days
              </small>
            </h3>
            <button type="button" className="recent-all" onClick={() => drill({ renewal: true })}>
              View all <ArrowRight size={14} />
            </button>
          </div>
          <div className="recent-table">
            {expiringList.slice(0, 6).map((r) => (
              <button key={r.id} className="recent-row" onClick={() => onOpen(r)}>
                <div className="recent-avatar">{r.full_name ? r.full_name.charAt(0).toUpperCase() : '?'}</div>
                <div className="recent-main">
                  <strong>{r.full_name}</strong>
                  <span>{r.ref}</span>
                  <span className="recent-dates">
                    <AppliedDate iso={r.created_at} />
                    <RenewalDate row={r} />
                  </span>
                </div>
                <span
                  className="plan-tag"
                  style={{ '--pc': PLAN_COLORS[r.membership_type] || '#9aa0a6' }}
                >
                  {r.membership_type || '—'}
                </span>
                <span className="recent-fee mono">{formatINR(r.membership_fee)}</span>
                <span className={`admin-badge ${r.status}`}>{statusLabel(r.status)}</span>
                <ArrowRight size={16} className="recent-arrow" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="chart-card funnel-card">
        <div className="funnel-head">
          <h3 className="chart-title"><CircleCheck size={16} /> Application pipeline</h3>
          <span className="funnel-rate">{approvalRate}% approval rate</span>
        </div>
        <div className="funnel">
          {funnelStages.map((s, i) => (
            <div className="funnel-cell" key={s.status}>
              {i > 0 && <span className="funnel-arrow" title="stage flow">→</span>}
              <button
                type="button"
                className="funnel-stage"
                style={{ '--fc': s.meta.dot, '--fsoft': s.meta.soft, '--ftext': s.meta.text }}
                onClick={() => drill({ status: s.status })}
                title={`Open ${s.label} applications`}
              >
                <span className="funnel-stage-top">
                  <i className="funnel-dot" />
                  <span className="funnel-label">{s.label}</span>
                </span>
                <strong className="funnel-count">{s.count}</strong>
                <span className="funnel-pct">{pct(s.count)}% of total</span>
                <span className="funnel-bar"><i style={{ width: `${pct(s.count)}%` }} /></span>
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="funnel-rejected"
          onClick={() => drill({ status: 'REJECTED' })}
          title="Open rejected applications"
        >
          <span>✗ Rejected</span>
          <strong>{stats.rejected}</strong>
          <span className="funnel-rej-pct">{pct(stats.rejected)}%</span>
        </button>
      </div>

      <div className="dash-duo">
        <div className="chart-card attention-card">
          <h3 className="chart-title"><AlertTriangle size={16} /> Needs attention</h3>
          <button type="button" className="attention-row tone-amber" onClick={() => drill({ status: 'SUBMITTED' })}>
            <span className="attention-icon"><Clock size={17} /></span>
            <span className="attention-main">
              <strong>{stats.pending} payments pending</strong>
              <small>Collect fees before approving members</small>
            </span>
            <ArrowRight size={16} className="attention-arrow" />
          </button>
          <button type="button" className="attention-row tone-blue" onClick={() => drill({ status: 'PAYMENT_SUBMITTED' })}>
            <span className="attention-icon"><ShieldCheck size={17} /></span>
            <span className="attention-main">
              <strong>{stats.awaiting} awaiting verification</strong>
              <small>Verify submitted transactions</small>
            </span>
            <ArrowRight size={16} className="attention-arrow" />
          </button>
          <button type="button" className="attention-row tone-red" onClick={() => drill({ renewal: true })}>
            <span className="attention-icon"><Timer size={17} /></span>
            <span className="attention-main">
              <strong>{stats.expiringSoon + stats.expired} renewals due</strong>
              <small>
                {stats.expiringSoon} expiring within 30 days
                {stats.expired > 0 ? ` · ${stats.expired} already expired` : ''}
              </small>
            </span>
            <ArrowRight size={16} className="attention-arrow" />
          </button>
        </div>

        <div className="chart-card">
          <h3 className="chart-title">Status mix</h3>
          {statusMix.length === 0 ? (
            <p className="admin-empty">No applications yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={172}>
                <PieChart>
                  <Pie
                    data={statusMix}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={46}
                    outerRadius={76}
                    paddingAngle={2}
                    strokeWidth={0}
                    onClick={(d) => {
                      const entry = d && d.payload ? d.payload : d
                      if (entry && entry.status) drill({ status: entry.status })
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {statusMix.map((d) => (
                      <Cell key={d.status} fill={statusMeta(d.status).dot} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="chart-legend">
                {statusMix.map((d) => (
                  <button
                    key={d.status}
                    type="button"
                    className="legend-item legend-btn"
                    onClick={() => drill({ status: d.status })}
                    title={`Open ${d.name} applications`}
                  >
                    <i style={{ background: statusMeta(d.status).dot }} />
                    {d.name} <span className="legend-count">{d.value}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card chart-wide">
          <h3 className="chart-title"><CalendarClock size={16} /> Applications · last 30 days <small className="chart-hint">click a day to filter</small></h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={daily}
              margin={{ top: 6, right: 8, left: -18, bottom: 0 }}
              onClick={(e) => {
                const p = e && e.activePayload && e.activePayload[0] && e.activePayload[0].payload
                if (p && p.iso) drill({ from: p.iso, to: p.iso })
              }}
              style={{ cursor: 'pointer' }}
            >
              <defs>
                <linearGradient id="appGradP" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#5f6368' }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#5f6368' }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="count" name="Applications" stroke="#0ea5e9" strokeWidth={2} fill="url(#appGradP)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3 className="chart-title">Membership plans <small className="chart-hint">click to filter</small></h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={plans}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={82}
                paddingAngle={2}
                strokeWidth={0}
                onClick={(d) => {
                  const entry = d && d.payload ? d.payload : d
                  if (entry && entry.name) drill({ plan: entry.name })
                }}
                style={{ cursor: 'pointer' }}
              >
                {plans.map((p, i) => (
                  <Cell key={p.name} fill={PLAN_COLORS[p.name] || CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="chart-legend">
            {plans.map((p) => (
              <button
                key={p.name}
                type="button"
                className="legend-item legend-btn"
                onClick={() => drill({ plan: p.name })}
                title={`Open ${p.name} applications`}
              >
                <i style={{ background: PLAN_COLORS[p.name] || '#0ea5e9' }} />
                {p.name} <span className="legend-count">{p.value}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="chart-card chart-full">
          <h3 className="chart-title">
            <TrendingUp size={16} /> Revenue collected · last 6 months
            {stats.revDelta !== null && (
              <span className={`rev-delta ${stats.revDelta >= 0 ? 'up' : 'down'}`}>
                {stats.revDelta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {Math.abs(stats.revDelta)}% vs last month
              </span>
            )}
            <small className="chart-hint">click a bar to filter that month</small>
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={monthly}
              margin={{ top: 6, right: 8, left: -8, bottom: 0 }}
              onClick={(e) => {
                const p = e && e.activePayload && e.activePayload[0] && e.activePayload[0].payload
                if (p && p.iso) {
                  const { from, to } = monthRange(p.iso)
                  drill({ from, to })
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#5f6368' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#5f6368' }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v >= 1000 ? v / 1000 + 'k' : v}`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatINR(v), 'Revenue']} />
              <Bar dataKey="revenue" name="Revenue" fill="#1a7f4b" radius={[5, 5, 0, 0]} maxBarSize={42} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-card recent-card">
        <div className="recent-head">
          <h3 className="chart-title">
            <FileText size={16} /> Recent applications
          </h3>
          <button type="button" className="recent-all" onClick={() => drill({})}>
            View all <ArrowRight size={14} />
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="admin-empty">No applications yet.</p>
        ) : (
          <div className="recent-table">
            {recent.map((r) => (
              <button key={r.id} className="recent-row" onClick={() => onOpen(r)}>
                <div className="recent-avatar">{r.full_name ? r.full_name.charAt(0).toUpperCase() : '?'}</div>
                <div className="recent-main">
                  <strong>{r.full_name}</strong>
                  <span>{r.ref}</span>
                  <span className="recent-dates">
                    <AppliedDate iso={r.created_at} />
                    <RenewalDate row={r} />
                  </span>
                </div>
                <span
                  className="plan-tag"
                  style={{ '--pc': PLAN_COLORS[r.membership_type] || '#9aa0a6' }}
                >
                  {r.membership_type || '—'}
                </span>
                <span className="recent-fee mono">{formatINR(r.membership_fee)}</span>
                <span className={`admin-badge ${r.status}`}>{statusLabel(r.status)}</span>
                <ArrowRight size={16} className="recent-arrow" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
