import { useEffect, useMemo, useRef } from 'react'
import gsap from 'gsap'
import {
  Users, Clock, ShieldCheck, BadgeCheck, IndianRupee, FileText, ArrowRight
} from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts'
import StatCard from './StatCard.jsx'
import { statusLabel, PLAN_COLORS, CHART_COLORS } from './meta.js'
import { formatINR } from '../formUtils.js'

const fmtDate = (iso) => {
  const [y, m, d] = (iso || '').slice(0, 10).split('-')
  return d ? `${d}/${m}` : ''
}

function useReveal() {
  const ref = useRef(null)
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ref.current.querySelectorAll('.chart-card, .dash-row'),
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: 'power2.out' }
      )
    }, ref)
    return () => ctx.revert()
  }, [])
  return ref
}

export default function Dashboard({ rows, onOpen }) {
  const dashRef = useReveal()

  const stats = useMemo(() => {
    const total = rows.length
    const pending = rows.filter((r) => r.status === 'SUBMITTED').length
    const awaiting = rows.filter((r) => r.status === 'PAYMENT_SUBMITTED').length
    const approved = rows.filter((r) => r.status === 'APPROVED').length
    const revenue = rows
      .filter((r) => r.status === 'VERIFIED' || r.status === 'APPROVED')
      .reduce((s, r) => s + (Number(r.membership_fee) || 0), 0)
    return { total, pending, awaiting, approved, revenue }
  }, [rows])

  const daily = useMemo(() => {
    const map = new Map()
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      map.set(d.toDateString(), 0)
    }
    rows.forEach((r) => {
      if (r.created_at) {
        const d = new Date(r.created_at)
        if (map.has(d.toDateString())) map.set(d.toDateString(), map.get(d.toDateString()) + 1)
      }
    })
    return Array.from(map.entries()).map(([k, v]) => ({ day: k.slice(4, 10), count: v }))
  }, [rows])

  const plans = useMemo(() => {
    const map = new Map()
    rows.forEach((r) => {
      const p = r.membership_type || 'Other'
      map.set(p, (map.get(p) || 0) + 1)
    })
    return Array.from(map.entries()).map(([k, v]) => ({ name: k, value: v }))
  }, [rows])

  const monthly = useMemo(() => {
    const map = new Map()
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() - i)
      map.set(d.toISOString().slice(0, 7), 0)
    }
    rows.forEach((r) => {
      if (r.created_at && (r.status === 'VERIFIED' || r.status === 'APPROVED')) {
        const k = r.created_at.slice(0, 7)
        if (map.has(k)) map.set(k, map.get(k) + (Number(r.membership_fee) || 0))
      }
    })
    return Array.from(map.entries()).map(([k, v]) => ({ month: k.slice(5), revenue: Math.round(v) }))
  }, [rows])

  const recent = rows.slice(0, 6)

  const tooltipStyle = {
    borderRadius: 8,
    border: '1px solid #dadce0',
    fontSize: 12.5,
    boxShadow: '0 4px 14px rgba(0,0,0,.08)'
  }

  return (
    <div className="admin-view" ref={dashRef}>
      <div className="admin-view-head">
        <div>
          <h2>Dashboard</h2>
          <p className="admin-sub">Overview of membership applications</p>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard icon={<Users size={20} />} label="Total applications" value={stats.total} color="#0ea5e9" delay={0} />
        <StatCard icon={<Clock size={20} />} label="Payment pending" value={stats.pending} color="#f59e0b" delay={0.06} />
        <StatCard icon={<ShieldCheck size={20} />} label="Awaiting verification" value={stats.awaiting} color="#3b82f6" delay={0.12} />
        <StatCard icon={<BadgeCheck size={20} />} label="Approved members" value={stats.approved} color="#22c55e" delay={0.18} />
        <StatCard icon={<IndianRupee size={20} />} label="Revenue collected" value={stats.revenue} color="#8b5cf6" delay={0.24} sub={formatINR(stats.revenue)} />
      </div>

      <div className="chart-grid">
        <div className="chart-card chart-wide">
          <h3 className="chart-title">Applications · last 30 days</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={daily} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="appGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#5f6368' }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#5f6368' }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="count" name="Applications" stroke="#0ea5e9" strokeWidth={2} fill="url(#appGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3 className="chart-title">Membership plans</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={plans} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2} strokeWidth={0}>
                {plans.map((p, i) => (
                  <Cell key={p.name} fill={PLAN_COLORS[p.name] || CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="chart-legend">
            {plans.map((p) => (
              <span key={p.name} className="legend-item">
                <i style={{ background: PLAN_COLORS[p.name] || '#0ea5e9' }} />
                {p.name}
              </span>
            ))}
          </div>
        </div>

        <div className="chart-card chart-wide">
          <h3 className="chart-title">Revenue collected · last 6 months</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
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
                  <span>
                    {r.ref} · {fmtDate(r.start_date)} → {fmtDate(r.end_date)}
                  </span>
                </div>
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
