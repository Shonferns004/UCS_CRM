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

const FunnelIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="18" x2="14" y2="18" />
  </svg>
)

export default function OverviewDateFilter({ value, onChange }) {
  const [active, setActive] = useState('month')
  const [open, setOpen] = useState(false)

  const applyPreset = (key) => {
    setActive(key)
    if (key === 'custom') {
      // Keep the currently selected dates; the inputs below edit them directly.
      setOpen(true)
      return
    }
    onChange(presetRange(key))
    setOpen(false)
  }

  const invalid = value.from && value.to && value.from > value.to
  const activeLabel = PRESETS.find(p => p.key === active)?.label || 'This Month'

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={open ? 'Hide date range' : 'Choose date range'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
          border: `1px solid ${open || active !== 'month' ? 'var(--sage, #5B6B4E)' : 'var(--line, #e5e7eb)'}`,
          background: open || active !== 'month' ? 'var(--sage, #5B6B4E)' : '#fff',
          color: open || active !== 'month' ? '#fff' : '#475569',
          fontSize: 12.5, fontWeight: 600,
        }}
      >
        <FunnelIcon />
        {activeLabel}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Date range"
            style={{
              position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 50,
              width: 300, maxWidth: '92vw', background: '#fff', border: '1px solid var(--line, #e5e7eb)',
              borderRadius: 12, boxShadow: '0 16px 40px rgba(15,23,42,.16)', padding: 6,
            }}
          >
            {PRESETS.map(p => {
              const isOn = active === p.key
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPreset(p.key)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    width: '100%', padding: '8px 10px', border: 'none', borderRadius: 8,
                    background: isOn ? '#f4f7f1' : 'transparent', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 12.5, fontWeight: isOn ? 700 : 500,
                    color: isOn ? 'var(--sage, #5B6B4E)' : '#475569', textAlign: 'left',
                  }}
                  onMouseEnter={e => { if (!isOn) e.currentTarget.style.background = '#f8fafc' }}
                  onMouseLeave={e => { if (!isOn) e.currentTarget.style.background = 'transparent' }}
                >
                  {p.label}
                  {isOn && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
              )
            })}

            {active === 'custom' && (
              <div style={{ borderTop: '1px solid var(--line, #e5e7eb)', marginTop: 6, padding: '10px 6px 4px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <label style={{ flex: 1, fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#94a3b8' }}>
                    From
                    <input
                      type="date" value={value.from || ''} max={value.to || undefined}
                      onChange={e => onChange({ ...value, from: e.target.value })}
                      style={{ display: 'block', width: '100%', height: 32, border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, padding: '0 8px', fontSize: 12, fontFamily: 'inherit', background: '#fff', marginTop: 4 }}
                    />
                  </label>
                  <label style={{ flex: 1, fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#94a3b8' }}>
                    To
                    <input
                      type="date" value={value.to || ''} min={value.from || undefined}
                      onChange={e => onChange({ ...value, to: e.target.value })}
                      style={{ display: 'block', width: '100%', height: 32, border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, padding: '0 8px', fontSize: 12, fontFamily: 'inherit', background: '#fff', marginTop: 4 }}
                    />
                  </label>
                </div>
                {invalid && <div style={{ fontSize: 11.5, color: '#b91c1c' }}>Start date cannot be after end date.</div>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
