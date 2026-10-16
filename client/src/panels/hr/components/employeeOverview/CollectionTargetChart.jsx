import { useMemo, useRef, useState } from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const INTERVALS = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
]

const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN')
const shortInr = (n) => {
  const v = Number(n) || 0
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}k`
  return `₹${v}`
}

const labelFor = (bucket, interval) => {
  if (interval === 'month') {
    const [y, m] = String(bucket).split('-')
    const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${M[Number(m) - 1]} ${y}`
  }
  return String(bucket).slice(5) // MM-DD for day/week
}

// Monthly target repeated across each day/week of its month so the target
// bars show at any interval. Month granularity uses the resolved target.
const attachTargets = (series, targetsByMonth, interval) => {
  if (interval === 'month') {
    const byMonth = new Map((targetsByMonth || []).map(t => [t.month, t]))
    return series.map(s => {
      const t = byMonth.get(s.bucket)
      return { ...s, target: t && t.configured ? Number(t.target) : null }
    })
  }
  return series.map(s => {
    const month = String(s.bucket).slice(0, 7)
    const t = (targetsByMonth || []).find(x => x.month === month)
    return { ...s, target: t && t.configured ? Number(t.target) : null }
  })
}

// Running totals for the cumulative progress strip below the chart.
const withCumulative = (rows) => {
  let c = 0
  const seen = new Set()
  return rows.map(r => {
    c += Number(r.amount) || 0
    let addTarget = 0
    const month = String(r.bucket).slice(0, 7)
    if (r.target != null && !seen.has(month)) { seen.add(month); addTarget = r.target }
    return { ...r, cumCollection: c, cumTargetDelta: addTarget }
  }).reduce((acc, r, i, arr) => {
    const prev = i > 0 ? acc[i - 1].cumTarget : 0
    acc.push({ ...r, cumTarget: prev + r.cumTargetDelta })
    return acc
  }, [])
}

export default function CollectionTargetChart({ trend, loading, error }) {
  const [interval, setInterval_] = useState('month')
  const chartRef = useRef(null)

  const rows = useMemo(() => {
    if (!trend?.series) return []
    return withCumulative(attachTargets(trend.series, trend.targets_by_month, trend.interval || interval))
  }, [trend, interval])

  const eff = trend?.interval || interval
  const targetable = rows.some(r => r.target != null)

  const maxTarget = Math.max(...rows.map(r => r.cumTarget || 0), 0)
  const cum = rows.at(-1)?.cumCollection || 0
  const pct = maxTarget > 0 ? Math.min(100, Math.round(cum / maxTarget * 100)) : null

  // Vertical green gradient painted on the canvas once, reused by all bars.
  const gradient = (ctx) => {
    const { chart } = ctx
    const { ctx: c, chartArea } = chart
    if (!chartArea) return '#5B6B4E'
    const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
    g.addColorStop(0, '#8fb07a')
    g.addColorStop(1, '#4a5a3d')
    return g
  }

  const data = {
    labels: rows.map(r => labelFor(r.bucket, eff)),
    datasets: [
      ...(targetable ? [{
        label: 'Target',
        data: rows.map(r => r.target),
        backgroundColor: 'rgba(200,210,188,0.45)',
        borderRadius: 8,
        borderSkipped: false,
        barPercentage: 0.9,
        categoryPercentage: 0.62,
        order: 2,
      }] : []),
      {
        label: 'Collection',
        data: rows.map(r => r.amount),
        backgroundColor: (ctx) => gradient(ctx),
        hoverBackgroundColor: '#3f4c34',
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.62,
        categoryPercentage: 0.62,
        order: 1,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    layout: { padding: { top: 6 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#191c1e',
        bodyColor: '#374151',
        borderColor: 'rgba(15,23,42,0.1)',
        borderWidth: 1,
        cornerRadius: 10,
        padding: 10,
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8,
        boxPadding: 4,
        callbacks: { label: (c) => ` ${c.dataset.label}: ${inr(c.parsed.y)}` },
      },
    },
    scales: {
      x: {
        stacked: false,
        grid: { display: false },
        border: { display: false },
        ticks: { color: '#94a3b8', font: { size: 10, weight: 300 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
      },
      y: {
        beginAtZero: true,
        grid: { color: '#eef2f7', drawTicks: false },
        border: { display: false, dash: [3, 3] },
        ticks: { color: '#94a3b8', font: { size: 10, weight: 300 }, padding: 8, maxTicksLimit: 6, callback: (v) => shortInr(v) },
      },
    },
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line, #e5e7eb)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <div style={{ marginRight: 'auto' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#191c1e' }}>Collection vs Target</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Receipts attributed to this volunteer</div>
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg, #f1f5fb)', border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, padding: 3 }}>
          {INTERVALS.map(i => (
            <button
              key={i.key}
              type="button"
              onClick={() => setInterval_(i.key)}
              style={{
                border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600,
                fontFamily: 'inherit', cursor: 'pointer',
                background: interval === i.key ? '#fff' : 'transparent',
                color: interval === i.key ? 'var(--sage, #5B6B4E)' : 'var(--ink-soft, #64748b)',
                boxShadow: interval === i.key ? '0 1px 2px rgba(0,0,0,.08)' : 'none',
              }}
            >
              {i.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="sk" style={{ height: 280, borderRadius: 12 }} />
      ) : error ? (
        <div style={{ fontSize: 12, color: '#b91c1c', padding: '40px 0', textAlign: 'center' }}>Could not load chart data.</div>
      ) : rows.length === 0 ? (
        <div className="empty" style={{ padding: '40px 0', textAlign: 'center', borderRadius: 12 }}>No receipts in this period.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 18, marginBottom: 10, fontSize: 12, color: '#4b5563', fontWeight: 500 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: 'linear-gradient(180deg,#8fb07a,#4a5a3d)' }} />
              Collection
            </span>
            {targetable && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(200,210,188,0.6)' }} />
                Target
              </span>
            )}
          </div>

          <div style={{ position: 'relative', height: 280 }}>
            <Bar ref={chartRef} data={data} options={options} />
          </div>

          {/* Cumulative progress strip — one number against the period target. */}
          <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 12, background: 'var(--bg, #f1f5fb)', border: '1px solid var(--line, #e5e7eb)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{inr(cum)}</span>
              <span style={{ fontSize: 12, color: 'var(--ink-soft, #64748b)' }}>cumulative collection</span>
              {pct != null && (
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: pct >= 100 ? '#16a34a' : 'var(--ink-soft, #64748b)' }}>
                  {pct}% of {inr(maxTarget)} target
                </span>
              )}
            </div>
            <div style={{ height: 8, borderRadius: 999, background: '#e7ecdf', overflow: 'hidden' }}>
              <div style={{ width: `${pct ?? 0}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#8fb07a,#4a5a3d)' }} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
