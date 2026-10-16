import { useMemo, useState } from 'react'

// Daily collection heatmap, joining → selected end (default window: last 12
// months). GitHub-style grid: one row per week, one column per weekday.
// Shades use the amounts scale; zero vs missing vs pre-joining are visually
// distinct, and important states carry a text marker (not colour alone).

const LEVELS = [
  { min: 1, color: '#dfe6d8' },
  { min: 500, color: '#b9c8ad' },
  { min: 2000, color: '#8fa67f' },
  { min: 10000, color: '#5B6B4E' },
  { min: 25000, color: '#3d4a34' },
]
const ZERO_COLOR = '#f2f4f0'
const PREJOIN_COLOR = 'repeating-linear-gradient(45deg, #f7f7f7, #f7f7f7 3px, #ececec 3px, #ececec 6px)'
const ATT_TINT = { present: null, absent: '#fde8e8', leave: '#e8f0fd', half_day: '#fff4e0' }

const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN')
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DOW = ['S','M','T','W','T','F','S']

const levelColor = (amount) => {
  if (!amount || amount <= 0) return ZERO_COLOR
  let c = LEVELS[0].color
  for (const l of LEVELS) if (amount >= l.min) c = l.color
  return c
}

const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

export default function CollectionHeatmap({ data, loading, onDaySelect }) {
  const [selected, setSelected] = useState(null)
  const [hover, setHover] = useState(null) // {day, x, y} via title fallback + detail card

  const { weeks, byDay, targetByMonth, joiningDay, from, to } = useMemo(() => {
    const byDay = new Map((data?.days || []).map(d => [d.date, d]))
    const targetByMonth = new Map((data?.targets_by_month || []).map(t => [t.month, t]))
    const joiningDay = data?.joining_date || null
    const from = data?.range?.from
    const to = data?.range?.to
    if (!from || !to) return { weeks: [], byDay, targetByMonth, joiningDay, from, to }
    // Grid starts on the Sunday of the week containing `from`.
    const startDow = new Date(`${from}T00:00:00Z`).getUTCDay()
    let cursor = addDays(from, -startDow)
    const endDow = new Date(`${to}T00:00:00Z`).getUTCDay()
    const gridEnd = addDays(to, 6 - endDow)
    const weeks = []
    let week = []
    while (cursor <= gridEnd) {
      week.push(cursor)
      if (week.length === 7) { weeks.push(week); week = [] }
      cursor = addDays(cursor, 1)
    }
    if (week.length) weeks.push(week)
    return { weeks, byDay, targetByMonth, joiningDay, from, to }
  }, [data])

  const pick = (day) => {
    setSelected(day)
    onDaySelect?.(day)
  }

  const detail = useMemo(() => {
    if (!selected) return null
    const d = byDay.get(selected) || null
    const month = selected.slice(0, 7)
    const t = targetByMonth.get(month)
    const status = data?.attendance?.[selected]
    const preJoin = joiningDay && selected < joiningDay
    const inRange = selected >= from && selected <= to
    return {
      day: selected,
      amount: d?.amount || 0,
      count: d?.count || 0,
      target: t && t.configured ? t.target : null,
      targetSource: t?.source || null,
      status: status || null,
      preJoin, inRange,
      weekday: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(`${selected}T00:00:00Z`).getUTCDay()],
    }
  }, [selected, byDay, targetByMonth, data, joiningDay, from, to])

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line, #e5e7eb)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginRight: 'auto' }}>Daily Collection</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--ink-soft, #64748b)' }}>
          <span>Less</span>
          <span style={{ width: 11, height: 11, borderRadius: 3, background: ZERO_COLOR, border: '1px solid var(--line, #e5e7eb)', display: 'inline-block' }} title="Eligible day, no collection" />
          {LEVELS.map(l => <span key={l.min} style={{ width: 11, height: 11, borderRadius: 3, background: l.color, display: 'inline-block' }} title={`≥ ₹${l.min.toLocaleString('en-IN')}`} />)}
          <span>More</span>
          <span style={{ marginLeft: 8, width: 11, height: 11, borderRadius: 3, background: PREJOIN_COLOR, border: '1px solid var(--line, #e5e7eb)', display: 'inline-block' }} title="Before joining" />
          <span style={{ marginLeft: 2 }}>Pre-joining</span>
        </div>
      </div>

      {loading ? (
        <div className="sk" style={{ height: 150, borderRadius: 8 }} />
      ) : weeks.length === 0 ? (
        <div className="empty" style={{ padding: '30px 0', textAlign: 'center' }}>No data for this period.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'inline-flex', gap: 10 }}>
            {/* Weekday labels */}
            <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 12px)', gap: 3, fontSize: 9, color: 'var(--ink-soft, #64748b)', paddingTop: 16 }}>
              {DOW.map((d, i) => <div key={i} style={{ height: 12, lineHeight: '12px' }}>{i % 2 === 1 ? d : ''}</div>)}
            </div>
            <div>
              {/* Month labels */}
              <div style={{ display: 'flex', gap: 3, height: 16, fontSize: 10, color: 'var(--ink-soft, #64748b)', marginBottom: 2 }}>
                {weeks.map((w, wi) => {
                  const first = w.find(d => d >= from && d <= to) || w[0]
                  const show = wi === 0 || first.slice(8, 10) <= '07'
                  return <div key={wi} style={{ width: 12, fontSize: 9 }}>{show ? MONTHS[Number(first.slice(5, 7)) - 1] : ''}</div>
                })}
              </div>
              <div style={{ display: 'flex', gap: 3 }}>
                {weeks.map((w, wi) => (
                  <div key={wi} style={{ display: 'grid', gridTemplateRows: 'repeat(7, 12px)', gap: 3 }}>
                    {w.map(day => {
                      const inR = day >= from && day <= to
                      const pre = joiningDay && day < joiningDay
                      const rec = byDay.get(day)
                      const status = data?.attendance?.[day]
                      const isSel = selected === day
                      const bg = !inR ? 'transparent' : pre ? PREJOIN_COLOR : levelColor(rec?.amount)
                      const tint = inR && !pre && status && ATT_TINT[status] ? ATT_TINT[status] : null
                      return (
                        <div
                          key={day}
                          role="gridcell"
                          tabIndex={inR ? 0 : -1}
                          aria-label={`${day}${rec ? `, ${inr(rec.amount)} from ${rec.count} receipts` : inR ? ', no collection' : ''}${status ? `, ${status}` : ''}${pre ? ', before joining' : ''}`}
                          title={`${day}${rec ? ` · ${inr(rec.amount)} · ${rec.count} receipt${rec.count === 1 ? '' : 's'}` : inR && !pre ? ' · ₹0' : ''}${status ? ` · ${status}` : pre ? ' · before joining' : ''}`}
                          onClick={() => inR && pick(day)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (inR) pick(day) } }}
                          onMouseEnter={() => inR && setHover(day)}
                          onMouseLeave={() => setHover(null)}
                          style={{
                            width: 12, height: 12, borderRadius: 3, cursor: inR ? 'pointer' : 'default',
                            background: bg,
                            border: isSel ? '2px solid #1a1a2e' : (inR && !pre && tint ? `1px solid ${tint}` : '1px solid rgba(0,0,0,.05)'),
                            boxSizing: 'border-box',
                            outline: hover === day ? '1px solid var(--sage, #5B6B4E)' : 'none',
                            opacity: !inR ? 0 : 1,
                          }}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: 'var(--bg, #f1f5fb)', border: '1px solid var(--line, #e5e7eb)', fontSize: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'baseline' }}>
            <span style={{ fontWeight: 700 }}>{detail.weekday}, {detail.day}</span>
            {detail.preJoin ? (
              <span style={{ color: 'var(--ink-soft, #64748b)' }}>Before joining date</span>
            ) : !detail.inRange ? (
              <span style={{ color: 'var(--ink-soft, #64748b)' }}>Outside selected range</span>
            ) : (
              <>
                <span style={{ fontWeight: 700, color: 'var(--sage, #5B6B4E)' }}>{inr(detail.amount)}</span>
                <span style={{ color: 'var(--ink-soft, #64748b)' }}>{detail.count} receipt{detail.count === 1 ? '' : 's'}</span>
                <span style={{ color: 'var(--ink-soft, #64748b)' }}>
                  {detail.target != null ? `Month target ${inr(detail.target)} (${detail.targetSource})` : 'No target set'}
                </span>
                {detail.status && <span style={{ color: 'var(--ink-soft, #64748b)' }}>Attendance: {detail.status}</span>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
