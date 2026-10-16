import { useMemo } from 'react'

const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN')

function Card({ title, value, sub, tip, loading, error, link, linkLabel }) {
  return (
    <div
      title={tip}
      style={{
        background: '#fff', border: '1px solid var(--line, #e5e7eb)', borderRadius: 12,
        padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 92,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-soft, #64748b)' }}>
        {title}
      </div>
      {loading ? (
        <div className="sk" style={{ height: 26, width: '60%', borderRadius: 6 }} />
      ) : error ? (
        <div style={{ fontSize: 13, color: '#b91c1c' }}>—</div>
      ) : (
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink, #1a1a2e)', lineHeight: 1.15 }}>{value}</div>
      )}
      <div style={{ fontSize: 11, color: 'var(--ink-soft, #64748b)', minHeight: 14 }}>{loading ? '' : (sub || '')}</div>
      {link && !loading && !error && (
        <button
          type="button"
          onClick={link}
          style={{ marginTop: 'auto', alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, fontSize: 11, fontWeight: 600, color: 'var(--sage, #5B6B4E)', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {linkLabel || 'View details →'}
        </button>
      )}
    </div>
  )
}

const pctText = (p) => (p == null ? '—' : `${p}%`)

export default function KpiCards({ data, loading, error, onOpenAttendance }) {
  const d = data
  const grid = useMemo(() => ({
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
    gap: 10,
  }), [])

  const targetSub = !d
    ? ''
    : d.target.amount == null
      ? 'No target set for this period'
      : `${inr(d.target.amount)} target · ${d.target.months_covered} month${d.target.months_covered === 1 ? '' : 's'}`
  const achievementSub = !d
    ? ''
    : d.achievement.pct == null
      ? (d.target.amount == null ? 'No target' : 'Target is zero')
      : d.achievement.remaining > 0
        ? `${inr(d.achievement.remaining)} remaining`
        : d.achievement.surplus != null
          ? `${inr(d.achievement.surplus)} above target`
          : 'Target met'
  const attSub = !d || !d.attendance || d.attendance.unavailable
    ? 'Open the Attendance tab for details'
    : `${d.attendance.present_days} present / ${d.attendance.eligible_days} eligible`
  const tenureSub = !d || !d.tenure
    ? ''
    : `${d.tenure.joining_date} · ${d.tenure.active ? 'Active' : String(d.tenure.status || '').replace(/^./, c => c.toUpperCase())}`

  return (
    <div style={grid}>
      <Card
        title="Total Collection"
        value={d ? inr(d.collection.amount) : '—'}
        sub={d ? `${d.collection.receipt_count.toLocaleString('en-IN')} receipt${d.collection.receipt_count === 1 ? '' : 's'} · by receipt date` : ''}
        tip="Sum of receipts attributed to this employee (name + aliases first, log fallback), deduplicated, receipt_date IST."
        loading={loading} error={error}
      />
      <Card
        title="Target Achievement"
        value={d ? pctText(d.achievement.pct) : '—'}
        sub={targetSub + (achievementSub ? ` · ${achievementSub}` : '')}
        tip="Collection ÷ sum of monthly targets resolved for the period (manual row → auto → carried forward)."
        loading={loading} error={error}
      />
      <Card
        title="Successful Receipts"
        value={d ? d.collection.receipt_count.toLocaleString('en-IN') : '—'}
        sub={d ? 'Positive-amount, deduplicated' : ''}
        tip="Receipts counted in the collection total: amount > 0, deduplicated by receipt id and payment identity."
        loading={loading} error={error}
      />
      <Card
        title="Attendance"
        value={d && d.attendance && !d.attendance.unavailable ? pctText(d.attendance.pct) : '—'}
        sub={attSub}
        tip="Present days ÷ eligible days (range from joining, minus approved leave). Same records as the Attendance tab."
        loading={loading} error={error}
        link={onOpenAttendance} linkLabel="Open Attendance →"
      />
      <Card
        title="Tenure"
        value={d && d.tenure ? `${d.tenure.days.toLocaleString('en-IN')} days` : '—'}
        sub={tenureSub}
        tip="Days from joining date to the end of the selected range (or today)."
        loading={loading} error={error}
      />
    </div>
  )
}
