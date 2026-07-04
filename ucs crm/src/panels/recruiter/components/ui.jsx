import { useState, useRef, useEffect } from 'react'
import { initials, avatarColor, avatarTint } from '../store'

function ChevronDown(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export function Dropdown({ value, onChange, options, placeholder, className, style, renderOption, renderValue, customTrigger, customValue, onCustomChange, menuInset }) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open && value === customTrigger && inputRef.current) inputRef.current.focus()
  }, [open, value, customTrigger])

  const opts = (options || []).map(o =>
    typeof o === 'string' || typeof o === 'number' ? { value: o, label: String(o) } : o
  )
  const selected = opts.find(o => o.value === value)
  const display = selected ? (renderValue ? renderValue(selected) : selected.label) : (placeholder || '')

  return (
    <div ref={ref} className={`dropdown ${open ? 'open' : ''} ${menuInset ? 'menu-inset' : ''} ${className || ''}`} style={style}
      tabIndex={0} onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}>
      <button className="dropdown-trigger" type="button" onClick={() => setOpen(!open)}>
        <span className="dropdown-label">{display || placeholder || ''}</span>
        <ChevronDown className={`dropdown-arrow ${open ? 'up' : ''}`} />
      </button>
      {open && (
        <div className="dropdown-menu">
          {opts.map((opt, i) => (
            <div key={i} className={`dropdown-item ${opt.value === value ? ' active' : ''}`}
              onMouseDown={() => { onChange?.({ target: { value: opt.value } }); if (opt.value !== customTrigger) setOpen(false) }}>
              {renderOption ? renderOption(opt) : opt.label}
            </div>
          ))}
          {value === customTrigger && (
            <div className="dropdown-item" style={{ padding: 4 }}>
              <input ref={inputRef} value={customValue || ''} onChange={e => onCustomChange?.(e.target.value)} placeholder="Specify source..." style={{ width: '100%', boxSizing: 'border-box' }} onMouseDown={e => e.stopPropagation()} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function Avatar({ name, size=34 }) {
  const c = avatarColor(name)
  return <div className="avatar" style={{ background:avatarTint(c), color:c, width:size, height:size }}>{initials(name)}</div>
}

export function Who({ name, role }) {
  return <div className="who"><Avatar name={name} /><div><div className="nm">{name}</div>{role && <div className="rl">{role}</div>}</div></div>
}

export function Score({ value }) {
  const cls = value >= 85 ? 'score-hi' : value >= 75 ? 'score-mid' : 'score-lo'
  return <span className={`score ${cls}`}>\u2605 {value}</span>
}

const PILL = { Open:['pill-green','#5B6B4E'], Paused:['pill-gold','#C08A2E'], Closed:['pill-gray','#888'] }
export function Pill({ status }) {
  const [cls,dot] = PILL[status] || ['pill-gray','#888']
  return <span className={`pill ${cls}`}><span className="d" style={{background:dot}} />{status}</span>
}
