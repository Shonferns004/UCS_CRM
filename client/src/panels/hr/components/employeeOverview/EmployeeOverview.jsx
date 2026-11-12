import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../../../api/auth'
import OverviewDateFilter, { presetRange } from './OverviewDateFilter'
import KpiCards from './KpiCards'
import CollectionTargetChart from './CollectionTargetChart'
import PerformanceTrends from './PerformanceTrends'
import AttendanceSummary from './AttendanceSummary'

// 12-month window ending at the selected range end — the Monthly Performance
// table's own default view, independent of the KPI/chart range above.
const heatmapWindow = (to) => {
  const end = new Date(`${to}T00:00:00Z`)
  const start = new Date(end)
  start.setUTCMonth(start.getUTCMonth() - 12, start.getUTCDate() + 1)
  return { from: start.toISOString().slice(0, 10), to }
}

// Accounts → Employee Detail → Overview analytics. Read-only: it only calls
// the GET endpoints (overview, collection-trend, heatmap); every number shown
// is defined in docs/overview-metric-dictionary.md. Attendance and Salary tabs
// are untouched and remain the authoritative detailed views.
export default function EmployeeOverview({ workerId, onOpenAttendance, history }) {
  const [range, setRange] = useState(() => presetRange('month'))
  const [interval, setInterval_] = useState('month')
  const [overview, setOverview] = useState(null)
  const [trend, setTrend] = useState(null)
  const [heatmap, setHeatmap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [trendLoading, setTrendLoading] = useState(true)
  const [error, setError] = useState('')
  const [trendError, setTrendError] = useState('')
  const seqRef = useRef(0)
  const heatSeqRef = useRef(0)

  const invalid = range.from && range.to && range.from > range.to
  const heat = useMemo(() => (range.to ? heatmapWindow(range.to) : null), [range.to])

  useEffect(() => {
    if (!workerId || invalid) return
    const seq = ++seqRef.current
    const ctrl = new AbortController()
    setLoading(true); setTrendLoading(true)
    setError(''); setTrendError('')
    const q = `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
    Promise.all([
      api(`/accounts/workers/${workerId}/overview?${q}`, { _prefix: 'ucs', signal: ctrl.signal }),
      api(`/accounts/workers/${workerId}/collection-trend?${q}&interval=${interval}`, { _prefix: 'ucs', signal: ctrl.signal }),
    ]).then(([ov, tr]) => {
      if (seq !== seqRef.current) return // stale — employee or range changed
      setOverview(ov); setTrend(tr)
    }).catch(err => {
      if (seq !== seqRef.current || ctrl.signal.aborted) return
      setError(err.message || 'Failed to load overview')
      setTrendError(err.message || 'Failed to load chart')
      setOverview(null); setTrend(null)
    }).finally(() => {
      if (seq !== seqRef.current) return
      setLoading(false); setTrendLoading(false)
    })
    return () => ctrl.abort()
  }, [workerId, range.from, range.to, interval, invalid])

  useEffect(() => {
    if (!workerId || !heat) return
    const seq = ++heatSeqRef.current
    const ctrl = new AbortController()
    const q = `from=${encodeURIComponent(heat.from)}&to=${encodeURIComponent(heat.to)}`
    api(`/accounts/workers/${workerId}/heatmap?${q}`, { _prefix: 'ucs', signal: ctrl.signal })
      .then(hm => { if (seq === heatSeqRef.current) setHeatmap(hm) })
      .catch(() => { if (seq === heatSeqRef.current) setHeatmap(null) })
    return () => ctrl.abort()
  }, [workerId, heat?.from, heat?.to])

  // `history` (imported months from History Import) is fetched once by
  // EmployeeDetail and passed in — it also feeds the Salary tab, so we don't
  // refetch it here.

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Date range control — no card/heading; the filter carries the range. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        {overview?.partial?.length > 0 && !error ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#6b7280', background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 999, padding: '4px 10px' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
            {[
              overview.partial.includes('range_clamped_to_3_years') && 'Range limited to the last 3 years.',
              overview.partial.includes('range_starts_before_joining') && 'Range starts before joining — pre-joining days are excluded.',
              overview.partial.includes('attendance_unavailable') && 'Attendance summary unavailable for this range.',
            ].filter(Boolean).join(' ')}
          </span>
        ) : <span />}
        <OverviewDateFilter value={range} onChange={setRange} />
      </div>

      {error && <div className="err-banner">{error}</div>}

      <KpiCards
        data={overview}
        loading={loading && !error}
        error={!!error}
        onOpenAttendance={onOpenAttendance}
      />

      <CollectionTargetChart
        trend={trend}
        loading={trendLoading && !trendError}
        error={!!trendError}
      />

      {heatmap && <PerformanceTrends data={heatmap} history={history} />}

      <AttendanceSummary data={overview} onOpenAttendance={onOpenAttendance} />

      {!loading && overview && (
        <div style={{ fontSize: 11, color: 'var(--ink-soft, #64748b)', textAlign: 'right' }}>
          Figures reconcile with the FRO collection card and NGO reports for the same period · times are IST
        </div>
      )}
    </div>
  )
}
