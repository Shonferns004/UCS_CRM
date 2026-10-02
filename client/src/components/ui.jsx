import { useState, useRef, useEffect, useCallback } from 'react'

export function Dropdown({ value, onChange, options, placeholder, renderOption, renderValue, customTrigger, customValue, onCustomChange, menuInset, searchable }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)
  const searchRef = useRef(null)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (open && value === customTrigger && inputRef.current) inputRef.current.focus()
  }, [open, value, customTrigger])

  useEffect(() => {
    if (open && searchable && searchRef.current) searchRef.current.focus()
  }, [open, searchable])

  const selected = options.find(o => (typeof o === 'string' ? o : o.value) === value)
  const filtered = searchable && query ? options.filter(o => (typeof o === 'string' ? o : (o.label || o.value)).toLowerCase().includes(query.toLowerCase())) : options

  return (
    <div className={`dropdown${menuInset ? ' menu-inset' : ''}`} ref={ref}>
      <button type="button" className="dropdown-trigger" onClick={() => { setOpen(!open); setQuery('') }}>
        {renderValue ? renderValue(selected) : (selected ? (typeof selected === 'string' ? selected : selected.label) : (placeholder || 'Select...'))}
        <ChevronDown />
      </button>
      {open && (
        <div className="dropdown-menu">
          {searchable && (
            <div className="dropdown-item" style={{ padding: 6 }}>
              <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search..." style={{ width: '100%', boxSizing: 'border-box', padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', fontSize: 13, outline: 'none', background: 'var(--paper)', color: 'var(--ink)' }} onClick={e => e.stopPropagation()} />
            </div>
          )}
          {filtered.map((opt) => {
            const optValue = typeof opt === 'string' ? opt : opt.value
            const optLabel = typeof opt === 'string' ? opt : opt.label
            return (
              <div key={optValue} className={`dropdown-item ${value === optValue ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); onChange({ target: { value: optValue } }); if (optValue !== customTrigger) setOpen(false) }}>
                {renderOption ? renderOption(opt) : optLabel}
              </div>
            )
          })}
          {value === customTrigger && (
            <div className="dropdown-item" style={{ padding: 4 }}>
              <input ref={inputRef} value={customValue || ''} onChange={e => onCustomChange?.(e.target.value)} placeholder="Specify source..." style={{ width: '100%', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export function DatePicker({ value, onChange, placeholder, min, max }) {
  // Callers are not all consistent: Reports passes a bare 'YYYY-MM-DD', but
  // EmployeeDetail passes created_at straight from the API, i.e. a full
  // timestamp. Normalising to the date half fixes both the label (appending
  // 'T00:00:00' to a timestamp yields Invalid Date) and the selected-day
  // highlight (which compares against a bare date key and so never matched).
  const iso = value ? String(value).slice(0, 10) : '';
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(iso ? new Date(`${iso}T00:00:00`) : new Date())
  const [viewMode, setViewMode] = useState('days')
  const [popupStyle, setPopupStyle] = useState({})
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open])

  const key = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  // Jump the calendar back to the selected month every time it opens, otherwise
  // reopening after paging through months silently shows a stale one.
  const openPicker = () => {
    if (iso) {
      const [y, m] = iso.split('-')
      const picked = new Date(Number(y), Number(m) - 1, 1)
      if (!Number.isNaN(picked.getTime())) setViewDate(picked)
    }
    setViewMode('days')
    // Fixed positioning against a measured anchor: the panel scrolls, and an
    // absolutely-positioned popup would be clipped by any overflow container.
    // The clamp keeps the 270px-wide popup fully on screen near either edge.
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setPopupStyle({
        left: Math.min(Math.max(rect.left + rect.width / 2, 145), Math.max(window.innerWidth - 145, 145)),
        top: rect.bottom + 4,
        transform: 'translateX(-50%)',
      })
    }
    setOpen(true)
  }

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const today = new Date()
  const todayKey = key(today.getFullYear(), today.getMonth(), today.getDate())

  const displayDate = iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : ''

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const yearStart = year - 6
  const yearEnd = year + 7
  const years = Array.from({ length: yearEnd - yearStart + 1 }, (_, i) => yearStart + i)

  const isDisabled = (k) => (min && k < min) || (max && k > max)

  const handleDayClick = (day) => {
    const k = key(year, month, day)
    if (isDisabled(k)) return
    // The payload is a bare string, not a synthetic event. Callers rely on that:
    // Recruiters.jsx does `onChange={v => setForm(f => ({ ...f, dob: v }))}` and
    // would store [object Object] if this ever became an event.
    onChange(k)
    setOpen(false)
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()

  return (
    <div className="datepicker" ref={ref}>
      <button type="button" className="dp-trigger" onClick={openPicker}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" style={{ flexShrink: 0 }}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span style={{ opacity: displayDate ? 1 : 0.55 }}>{displayDate || placeholder || 'Select date'}</span>
      </button>
      {open && (
        <div className="dp-popup" style={{ position: 'fixed', zIndex: 10000, ...popupStyle }}>
          <div className="dp-header">
            {viewMode === 'days' ? (
              <>
                <button type="button" className="dp-nav" onClick={() => setViewDate(new Date(year, month - 1, 1))}>&lsaquo;</button>
                <button type="button" className="dp-title-btn" onClick={() => setViewMode('months')}>{monthNames[month]} {year}</button>
                <button type="button" className="dp-nav" onClick={() => setViewDate(new Date(year, month + 1, 1))}>&rsaquo;</button>
              </>
            ) : viewMode === 'months' ? (
              <>
                <button type="button" className="dp-nav" onClick={() => setViewDate(new Date(year - 1, month, 1))}>&laquo;</button>
                <span className="dp-title">{year}</span>
                <button type="button" className="dp-nav" onClick={() => setViewDate(new Date(year + 1, month, 1))}>&raquo;</button>
              </>
            ) : (
              <>
                <button type="button" className="dp-nav" onClick={() => setViewDate(new Date(year - 14, month, 1))}>&laquo;</button>
                <span className="dp-title">{yearStart} &ndash; {yearEnd}</span>
                <button type="button" className="dp-nav" onClick={() => setViewDate(new Date(year + 14, month, 1))}>&raquo;</button>
              </>
            )}
          </div>
          {viewMode === 'days' && (
            <>
              <div className="dp-weekdays">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d} className="dp-wd">{d}</div>)}
              </div>
              <div className="dp-grid">
                {Array.from({ length: firstDay }, (_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1
                  const k = key(year, month, day)
                  const cls = (k === iso ? ' selected' : '') + (k === todayKey ? ' today' : '') + (isDisabled(k) ? ' disabled' : '')
                  return <div key={day} className={`dp-day${cls}`} onClick={() => handleDayClick(day)}>{day}</div>
                })}
              </div>
            </>
          )}
          {viewMode === 'months' && (
            <div className="dp-month-grid">
              {monthNames.map((m, i) => (
                <div key={m} className={`dp-month${i === month ? ' selected' : ''}`} onClick={() => { setViewDate(new Date(year, i, 1)); setViewMode('days') }}>{m.slice(0, 3)}</div>
              ))}
            </div>
          )}
          {viewMode === 'years' && (
            <div className="dp-year-grid">
              {years.map(y => (
                <div key={y} className={`dp-year${y === year ? ' selected' : ''}${y === today.getFullYear() ? ' today' : ''}`} onClick={() => { setViewDate(new Date(y, month, 1)); setViewMode('days') }}>{y}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function Avatar({ name, size = 36 }) {
  const initials = name ? name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() : '?'
  const colors = ['#4a7c6f','#3b82f6','#059669','#8b5cf6','#d97706','#e11d48','#0d9488','#0891b2','#0284c7','#6366f1']
  const color = colors[name ? name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length : 0]
  return (
    <div className="avatar" style={{ width: size, height: size, background: color, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600, fontSize: size * 0.4, flexShrink: 0 }}>
      {initials}
    </div>
  )
}

export function Pill({ label, color }) {
  const colors = {
    green: { bg: '#d1fae5', text: '#065f46' },
    yellow: { bg: '#fef3c7', text: '#92400e' },
    red: { bg: '#fee2e2', text: '#991b1b' },
    blue: { bg: '#dbeafe', text: '#1e40af' },
    gray: { bg: '#f3f4f6', text: '#374151' },
    purple: { bg: '#ede9fe', text: '#5b21b6' },
  }
  const c = colors[color] || colors.gray
  return (
    <span className="pill" style={{ background: c.bg, color: c.text, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.text, flexShrink: 0 }} />
      {label}
    </span>
  )
}

export function SkeletonRows({ rows = 6, widths = [], avatarCol = -1 }) {
  return Array.from({ length: rows }).map((_, i) => (
    <tr key={i} aria-hidden="true">
      {widths.map((w, c) => (
        <td key={c}>
          {c === avatarCol ? (
            <>
              <span className="sk" style={{ display: 'inline-block', width: 26, height: 26, borderRadius: '50%', marginRight: 8, verticalAlign: 'middle' }} />
              <span className="sk" style={{ display: 'inline-block', width: w, height: 13, verticalAlign: 'middle' }} />
            </>
          ) : (
            <span className="sk" style={{ display: 'inline-block', width: w, height: 12 }} />
          )}
        </td>
      ))}
    </tr>
  ))
}

export function SkeletonStats({ count = 4 }) {
  return Array.from({ length: count }).map((_, i) => (
    <div className="stat" key={i} aria-hidden="true">
      <div className="sk" style={{ width: 64, height: 11, margin: '0 auto 6px', borderRadius: 4 }} />
      <div className="sk" style={{ width: 34, height: 18, margin: '0 auto', borderRadius: 4 }} />
    </div>
  ))
}

export function Who({ name, role }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Avatar name={name} />
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#111' }}>{name}</div>
        <div style={{ fontSize: 12, color: '#666' }}>{role}</div>
      </div>
    </div>
  )
}

export const cleanField = (v) => {
  if (v == null) return v;
  if (typeof v === 'object') {
    const t = v.target || v.value || v.label;
    if (typeof t === 'string') return t;
    if (t && typeof t === 'object' && t.value != null) return String(t.value);
    return v.value || '';
  }
  const s = String(v).trim();
  if (!s.startsWith('{')) return s;
  try {
    const o = JSON.parse(s);
    if (o && typeof o === 'object') {
      const t = o.target || o.value;
      if (typeof t === 'string') return t;
      if (t && typeof t === 'object' && t.value != null) return String(t.value);
      if (typeof o.label === 'string') return o.label;
    }
  } catch (e) {}
  return s;
}
