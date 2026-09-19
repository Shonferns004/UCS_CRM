import { useMemo, useState } from 'react'
import { Icon } from './components'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const PERIODS = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'yearly', label: 'Yearly' },
]

const ACCENT = '#3B82F6'
const GRID = '#EEF2F7'
const INK_SOFT = '#64748B'
const LABEL = '#94A3B8'

function toDate(v) {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(String(v).slice(0, 10) + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
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

function buildBuckets(period, reminders) {
  const now = new Date()
  const buckets = []
  let start
  let bucketIndex

  if (period === 'monthly') {
    start = now.getFullYear() * 12 + now.getMonth()
    for (let i = 0; i < 6; i++) {
      const idx = start + i
      const y = Math.floor(idx / 12)
      const m = idx % 12
      buckets.push({ key: idx, label: MONTH_SHORT[m], full: `${MONTH_SHORT[m]} ${y}`, now: i === 0, value: 0 })
    }
    bucketIndex = d => d.getFullYear() * 12 + d.getMonth()
  } else if (period === 'quarterly') {
    start = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3)
    for (let i = 0; i < 4; i++) {
      const idx = start + i
      const y = Math.floor(idx / 4)
      const q = (idx % 4) + 1
      buckets.push({ key: idx, label: `Q${q}`, full: `Q${q} ${y}`, now: i === 0, value: 0 })
    }
    bucketIndex = d => d.getFullYear() * 4 + Math.floor(d.getMonth() / 3)
  } else {
    start = now.getFullYear()
    for (let i = 0; i < 4; i++) {
      const y = start + i
      buckets.push({ key: y, label: String(y), full: `Year ${y}`, now: i === 0, value: 0 })
    }
    bucketIndex = d => d.getFullYear()
  }

  for (const r of reminders) {
    const d = toDate(r._effectiveDate)
    if (!d) continue
    const bi = bucketIndex(d) - start
    if (bi >= 0 && bi < buckets.length) buckets[bi].value += r._amount || 0
  }
  return buckets
}

function smoothPath(pts) {
  if (!pts.length) return ''
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  return d
}

export default function BillChart({ reminders = [] }) {
  const [period, setPeriod] = useState('monthly')

  const buckets = useMemo(() => buildBuckets(period, reminders), [period, reminders])
  const total = useMemo(() => buckets.reduce((s, b) => s + b.value, 0), [buckets])
  const hasData = buckets.some(b => b.value > 0)

  const W = 520
  const H = 200
  const top = 30
  const bottom = 30
  const left = 16
  const right = 16
  const plotW = W - left - right
  const plotH = H - top - bottom
  const baselineY = top + plotH
  const step = plotW / buckets.length
  const max = Math.max(...buckets.map(b => b.value))

  const dataPoints = buckets.map((b, i) => {
    const cx = left + step * i + step / 2
    const val = Math.max(0, b.value)
    const y = val > 0 ? baselineY - (val / max) * plotH : baselineY
    return { x: cx, y, b }
  })

  const linePath = smoothPath(dataPoints)
  const areaPath = `${linePath} L ${dataPoints[dataPoints.length - 1].x} ${baselineY} L ${dataPoints[0].x} ${baselineY} Z`
  const gridYs = [1, 0.75, 0.5, 0.25].map(k => baselineY - plotH * k)

  return (
    <section className="dash-section bc-card">
      <div className="sec-head">
        <h3><span className="bc-head-icon"><Icon name="money" size={15} /></span> Bill Chart</h3>
        <span className="bc-total">{fmt(total)}</span>
      </div>

      <div className="dash-tabs">
        {PERIODS.map(p => (
          <button key={p.key} className={period === p.key ? 'dash-tab active' : 'dash-tab'} onClick={() => setPeriod(p.key)}>{p.label}</button>
        ))}
      </div>

      <div className="bc-body">
        {!hasData ? (
          <div className="bc-empty">No due amounts in this view.</div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Bill chart by period">
            <defs>
              <linearGradient id="bcArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity="0.18" />
                <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
              </linearGradient>
            </defs>
            {gridYs.map((gy, i) => (
              <line key={i} x1={left} y1={gy} x2={W - right} y2={gy} stroke={GRID} />
            ))}
            <path d={areaPath} fill="url(#bcArea)" />
            <path d={linePath} fill="none" stroke={ACCENT} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {dataPoints.map((p) => (
              <g key={p.b.key}>
                {p.b.value > 0 && (
                  <>
                    <circle cx={p.x} cy={p.y} r={p.b.now ? 5 : 4} fill="#fff" stroke={ACCENT} strokeWidth="2">
                      <title>{`${p.b.full}: ${fmt(p.b.value)}`}</title>
                    </circle>
                    <text x={p.x + 8} y={Math.max(p.y - 9, 12)} fontSize="9.5" fontWeight="600" fill={p.b.now ? ACCENT : INK_SOFT}>{compact(p.b.value)}</text>
                  </>
                )}
                <text x={p.x} y={baselineY + 18} textAnchor="middle" fontSize="9" fontWeight="500" fill={LABEL}>{p.b.label}</text>
              </g>
            ))}
          </svg>
        )}
      </div>
    </section>
  )
}