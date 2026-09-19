import { ArrowLeft, ArrowRight } from '../../icons'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i)

const btnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 12px',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--card-bg)',
  color: 'var(--ink)',
  fontSize: 12,
  fontFamily: 'inherit',
  cursor: 'pointer',
  fontWeight: 500,
  transition: 'all .15s',
  whiteSpace: 'nowrap',
}

export default function CalendarToolbar({
  year, month,
  onPrev, onNext, onToday,
  onMonthChange, onYearChange,
}) {
  return (
    <div className="eh-section-head" style={{ flexWrap: 'wrap', gap: 8 }}>
      <div className="eh-row" style={{ gap: 6 }}>
        <button className="eh-btn" onClick={onPrev} style={{ padding: '8px 11px' }}><ArrowLeft size={16} /></button>
        <button className="eh-btn" onClick={onToday}>Today</button>
        <button className="eh-btn" onClick={onNext} style={{ padding: '8px 11px' }}><ArrowRight size={16} /></button>
      </div>

      <div className="eh-row" style={{ gap: 10 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, minWidth: 140, margin: 0, color: 'var(--eh-ink)' }}>
          {MONTHS[month]} {year}
        </h3>
        <div className="eh-row" style={{ gap: 6 }}>
          <select className="eh-select" value={month} onChange={e => onMonthChange(Number(e.target.value))} style={{ minWidth: 130 }}>
            {MONTHS.map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
          </select>
          <select className="eh-select" value={year} onChange={e => onYearChange(Number(e.target.value))} style={{ minWidth: 90 }}>
            {YEARS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
