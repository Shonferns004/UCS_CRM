import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { Icon } from './components'
import { isPaid } from './PaymentReminderBanner'
import { computeEffectiveDueDate } from './notifications'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const PERIODS = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'halfyearly', label: 'Half-Yearly' },
  { key: 'yearly', label: 'Yearly' },
]

const GRID = '#eef2f7'
const AXIS = '#94a3b8'
const BAR_MUTED = '#93c5fd'
const BAR_CURRENT = '#2563eb'
const BAR_CURRENT_DEEP = '#1d4ed8'
const BAR_GRAD_ID = 'bcBarGrad'

function toDate(v) {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(String(v).slice(0, 10) + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

function amountOf(r) {
  if (r.amount) {
    const n = Number(r.amount)
    if (!isNaN(n) && n > 0) return n
  }
  const text = String(r.notes || '')
  const match = text.match(/(?:Rs\.?|₹)\s*([\d][\d,]*)/i)
  if (match) {
    const num = parseFloat(match[1].replace(/,/g, ''))
    if (!isNaN(num) && num > 0) return num
  }
  const match2 = text.match(/(?:amount|amt|rent|fee|of)\D*?([\d][\d,]*)/i)
  if (match2) {
    const num = parseFloat(match2[1].replace(/,/g, ''))
    if (!isNaN(num) && num > 0) return num
  }
  return 0
}

function fmt(n) {
  if (!n) return '₹0'
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

function compact(n) {
  if (!n) return '₹0'
  if (n >= 10000000) return '₹' + parseFloat((n / 10000000).toFixed(1)) + 'Cr'
  if (n >= 100000) return '₹' + parseFloat((n / 100000).toFixed(1)) + 'L'
  if (n >= 1000) return '₹' + parseFloat((n / 1000).toFixed(1)) + 'k'
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

function buildBuckets(period, rows) {
  const now = new Date()
  const buckets = []

  if (period === 'monthly') {
    const start = now.getFullYear() * 12 + now.getMonth()
    for (let i = 0; i < 12; i++) {
      const idx = start + i
      const y = Math.floor(idx / 12)
      const m = idx % 12
      buckets.push({ key: idx, label: MONTHS[m], full: `${MONTHS[m]} ${y}`, now: i === 0, value: 0, count: 0 })
    }
    const of = d => d.getFullYear() * 12 + d.getMonth()
    tally(buckets, rows, start, of)
  } else if (period === 'quarterly') {
    const start = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3)
    for (let i = 0; i < 4; i++) {
      const idx = start + i
      const y = Math.floor(idx / 4)
      const q = (idx % 4) + 1
      buckets.push({ key: idx, label: `Q${q}`, full: `Q${q} ${y}`, now: i === 0, value: 0, count: 0 })
    }
    const of = d => d.getFullYear() * 4 + Math.floor(d.getMonth() / 3)
    tally(buckets, rows, start, of)
  } else if (period === 'halfyearly') {
    const start = now.getFullYear() * 2 + Math.floor(now.getMonth() / 6)
    for (let i = 0; i < 4; i++) {
      const idx = start + i
      const y = Math.floor(idx / 2)
      const h = (idx % 2) + 1
      buckets.push({ key: idx, label: `H${h}`, full: `H${h} ${y}`, now: i === 0, value: 0, count: 0 })
    }
    const of = d => d.getFullYear() * 2 + Math.floor(d.getMonth() / 6)
    tally(buckets, rows, start, of)
  } else {
    const start = now.getFullYear()
    for (let i = 0; i < 5; i++) {
      const y = start + i
      buckets.push({ key: y, label: String(y), full: `Year ${y}`, now: i === 0, value: 0, count: 0 })
    }
    const of = d => d.getFullYear()
    tally(buckets, rows, start, of)
  }

  return buckets
}

function tally(buckets, rows, start, of) {
  for (const r of rows) {
    const d = toDate(r._effectiveDate || r.effectiveDate)
    const amt = r._amount != null ? r._amount : amountOf(r)
    if (!d || amt <= 0) continue
    const i = of(d) - start
    if (i >= 0 && i < buckets.length) {
      buckets[i].value += amt
      buckets[i].count += 1
    }
  }
}

function ChartTip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  return (
    <div className="bc-tip">
      <div className="bc-tip-title">{d.full}{d.now ? ' · Now' : ''}</div>
      <div className="bc-tip-amt">{fmt(d.value)}</div>
      <div className="bc-tip-meta">{d.count} upcoming bill{d.count !== 1 ? 's' : ''}</div>
    </div>
  )
}

export default function BillChart({ reminders = [] }) {
  const [period, setPeriod] = useState('monthly')

  const rows = useMemo(() => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayISO = `${todayStart.getFullYear()}-${String(todayStart.getMonth() + 1).padStart(2, '0')}-${String(todayStart.getDate()).padStart(2, '0')}`

    return reminders.filter(r => {
      if (!r || r.is_deleted) return false
      if (isPaid(r)) return false
      if (r.completed_at) return false
      const eff = r._effectiveDate || computeEffectiveDueDate(r)
      if (!eff) return false
      const d = toDate(eff)
      if (!d) return false
      if (String(eff).slice(0, 10) < todayISO) return false
      return true
    })
  }, [reminders])

  const buckets = useMemo(() => buildBuckets(period, rows), [period, rows])
  const total = useMemo(() => buckets.reduce((s, b) => s + b.value, 0), [buckets])
  const totalCount = useMemo(() => buckets.reduce((s, b) => s + b.count, 0), [buckets])
  const currentVal = buckets[0]?.value || 0
  const nextVal = buckets[1]?.value || 0
  const hasData = buckets.some(b => b.value > 0)

  return (
    <section className="dash-section bc-card">
      <div className="sec-head">
        <div className="bc-title">
          <span className="bc-head-icon"><Icon name="trending-up" size={15} /></span>
          <h3>Upcoming Expenses</h3>
        </div>
        <div className="bc-stat-chip">
          <span className="bc-total">{fmt(total)}</span>
          <span className="bc-total-count">{totalCount} bill{totalCount !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="bc-toolbar">
        <div className="bc-tabs">
          {PERIODS.map(p => (
            <button key={p.key} className={`bc-tab ${period === p.key ? 'active' : ''}`} onClick={() => setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="bc-stats">
          <span className="bc-stat"><small>This period</small><strong>{fmt(currentVal)}</strong></span>
          <span className="bc-stat"><small>Next</small><strong>{fmt(nextVal)}</strong></span>
          <span className="bc-stat"><small>Total upcoming</small><strong>{fmt(total)}</strong></span>
        </div>
      </div>

      <div className="bc-body">
        {!hasData ? (
          <div className="bc-empty">
            <Icon name="money" size={30} color="var(--rem-ink-soft)" />
            <div className="big">No upcoming expenses</div>
            <div className="small">Add unpaid bills with a future due date to see your cashflow forecast.</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={buckets} margin={{ top: 18, right: 8, left: 4, bottom: 0 }} barCategoryGap="28%">
              <defs>
                <linearGradient id={BAR_GRAD_ID} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#60a5fa" stopOpacity="1" />
                  <stop offset="100%" stopColor={BAR_MUTED} stopOpacity="0.55" />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 5" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: AXIS, fontWeight: 600 }}
                dy={6}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={52}
                tick={{ fontSize: 10.5, fill: AXIS }}
                tickFormatter={compact}
              />
              <Tooltip cursor={{ fill: 'rgba(37,99,235,0.06)' }} content={<ChartTip />} />
              <Bar dataKey="value" radius={[8, 8, 2, 2]} maxBarSize={58} isAnimationActive animationDuration={750} animationEasing="ease-out">
                {buckets.map((b) => (
                  <Cell key={b.key} fill={b.now ? BAR_CURRENT : `url(#${BAR_GRAD_ID})`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}