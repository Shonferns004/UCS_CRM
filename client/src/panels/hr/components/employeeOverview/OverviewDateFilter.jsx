import { useState } from 'react'

// Date-range presets for the Employee Overview. All values are IST calendar
// days (YYYY-MM-DD); the backend re-validates and clamps.
const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'last_3_months', label: 'Last 3 Months' },
  { key: 'fy', label: 'Financial Year' },
  { key: 'lifetime', label: 'Lifetime' },
  { key: 'custom', label: 'Custom' },
]

const istToday = () => new Date(Date.now() + (5.5 * 60 * 60 * 1000)).toISOString().slice(0, 10)
const pad = (n) => String(n).padStart(2, '0')

export function presetRange(key) {
  const today = istToday()
  const [ty, tm, td] = today.split('-').map(Number)
  switch (key) {
    case 'today': return { from: today, to: today }
    case 'week': {
      // Sunday-start week, matching the backend trend buckets.
      const dow = new Date(`${today}T00:00:00Z`).getUTCDay()
      const start = new Date(Date.parse(`${today}T00:00:00Z`) - dow * 86400000).toISOString().slice(0, 10)
      return { from: start, to: today }
    }
    case 'month': return { from: `${ty}-${pad(tm)}-01`, to: today }
    case 'last_month': {
      const d = new Date(Date.UTC(ty, tm - 2, 1))
      const y = d.getUTCFullYear(); const m = d.getUTCMonth() + 1
      const end = new Date(Date.UTC(ty, tm - 1, 0)).toISOString().slice(0, 10)
      return { from: `${y}-${pad(m)}-01`, to: end }
    }
    case 'last_3_months': {
      const d = new Date(Date.UTC(ty, tm - 3, td))
      return { from: d.toISOString().slice(0, 10), to: today }
    }
    case 'fy': {
      // April–March financial year containing today.
      const fyStartYear = tm >= 4 ? ty : ty - 1
      const start = `${fyStartYear}-04-01`
      const end = `${fyStartYear + 1}-03-31`
      return { from: start, to: end > today ? today : end }
    }
    case 'lifetime': return { from: '2000-01-01', to: today }
    default: return { from: `${ty}-${pad(tm)}-01`, to: today }
  }
}

export default function OverviewDateFilter({ value, onChange }) {
  const [active, setActive] = useState('month')
  const [customOpen, setCustomOpen] = useState(false)

  const applyPreset = (key) => {
    setActive(key)
    if (key === 'custom') { setCustomOpen(true); return }
    setCustomOpen(false)
    onChange(presetRange(key))
  }

  const invalid = value.from && value.to && value.from > value.to

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {PRESETS.map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPreset(p.key)}
            style={{
              border: '1px solid',
              borderColor: active === p.key ? 'var(--sage, #5B6B4E)' : 'var(--line, #e5e7eb)',
              background: active === p.key ? 'var(--sage, #5B6B4E)' : '#fff',
              color: active === p.key ? '#fff' : 'var(--ink-soft, #64748b)',
              borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      {(customOpen || active === 'custom') && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <label style={{ color: 'var(--ink-soft, #64748b)', fontWeight: 600 }}>
            From
            <input
              type="date" value={value.from || ''} max={value.to || undefined}
              onChange={e => onChange({ ...value, from: e.target.value })}
              style={{ display: 'block', height: 32, border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, padding: '0 8px', fontSize: 12, fontFamily: 'inherit', background: '#fff', marginTop: 3 }}
            />
          </label>
          <label style={{ color: 'var(--ink-soft, #64748b)', fontWeight: 600 }}>
            To
            <input
              type="date" value={value.to || ''} min={value.from || undefined}
              onChange={e => onChange({ ...value, to: e.target.value })}
              style={{ display: 'block', height: 32, border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, padding: '0 8px', fontSize: 12, fontFamily: 'inherit', background: '#fff', marginTop: 3 }}
            />
          </label>
        </div>
      )}
      {invalid && (
        <div style={{ fontSize: 12, color: '#b91c1c' }}>Start date cannot be after end date.</div>
      )}
    </div>
  )
}
