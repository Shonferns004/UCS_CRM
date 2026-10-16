import { useMemo } from 'react'

// Monthly performance table derived from the daily heatmap payload — same
// receipts, same targets. Shows collection, target, achievement, receipt
// count, MoM change, plus best day / best month highlights. Read-only.

const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN')
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const label = (month) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`

export default function PerformanceTrends({ data }) {
  const { months, bestDay, bestMonth, total, count } = useMemo(() => {
    const byMonth = new Map()
    const byDay = new Map()
    for (const d of data?.days || []) {
      const m = d.date.slice(0, 7)
      const cur = byMonth.get(m) || { month: m, amount: 0, count: 0 }
      cur.amount += d.amount; cur.count += d.count
      byMonth.set(m, cur)
      byDay.set(d.date, (byDay.get(d.date) || 0) + d.amount)
    }
    const targetByMonth = new Map((data?.targets_by_month || []).map(t => [t.month, t]))
    let prev = null
    const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).map(row => {
      const t = targetByMonth.get(row.month)
      const target = t && t.configured ? Number(t.target) : null
      const pct = target ? Math.round((row.amount / target) * 100) : null
      const mom = prev != null && prev > 0 ? Math.round(((row.amount - prev) / prev) * 100) : null
      prev = row.amount
      return { ...row, target, pct, mom, source: t?.source || null }
    })
    let bestDay = null
    for (const [date, amount] of byDay) if (!bestDay || amount > bestDay.amount) bestDay = { date, amount }
    let bestMonth = null
    for (const m of months) if (!bestMonth || m.amount > bestMonth.amount) bestMonth = m
    const total = months.reduce((s, m) => s + m.amount, 0)
    const count = months.reduce((s, m) => s + m.count, 0)
    return { months, bestDay, bestMonth, total, count }
  }, [data])

  if (!data) return null

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line, #e5e7eb)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Monthly Performance</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Highlight label="Total Collection" value={inr(total)} sub={`${count} receipts`} />
        <Highlight label="Best Month" value={bestMonth ? label(bestMonth.month) : '—'} sub={bestMonth ? inr(bestMonth.amount) : 'No collection yet'} />
        <Highlight label="Best Day" value={bestDay ? bestDay.date : '—'} sub={bestDay ? inr(bestDay.amount) : 'No collection yet'} />
      </div>

      {months.length === 0 ? (
        <div className="empty" style={{ padding: '18px 0', textAlign: 'center', fontSize: 12 }}>No collection in this period.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--ink-soft, #64748b)', borderBottom: '1px solid var(--line, #e5e7eb)' }}>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Month</th>
                <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Collection</th>
                <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Target</th>
                <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Achievement</th>
                <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Receipts</th>
                <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>MoM</th>
              </tr>
            </thead>
            <tbody>
              {months.map(m => (
                <tr key={m.month} style={{ borderBottom: '1px solid var(--line, #e5e7eb)' }}>
                  <td style={{ padding: '7px 8px', fontWeight: 600 }}>{label(m.month)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inr(m.amount)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: m.target == null ? 'var(--ink-soft, #64748b)' : undefined }}>
                    {m.target == null ? '—' : inr(m.target)}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: m.pct == null ? 'var(--ink-soft, #64748b)' : m.pct >= 100 ? 'var(--sage, #5B6B4E)' : undefined }}>
                    {m.pct == null ? '—' : `${m.pct}%`}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{m.count}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: m.mom == null ? 'var(--ink-soft, #64748b)' : m.mom >= 0 ? 'var(--sage, #5B6B4E)' : '#b45309' }}>
                    {m.mom == null ? '—' : `${m.mom > 0 ? '+' : ''}${m.mom}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Highlight({ label, value, sub }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg, #f1f5fb)', border: '1px solid var(--line, #e5e7eb)' }}>
      <div style={{ fontSize: 10, color: 'var(--ink-soft, #64748b)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--ink-soft, #64748b)', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}
