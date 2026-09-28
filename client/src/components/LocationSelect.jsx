import { useEffect, useMemo, useRef, useState } from 'react'
import { STATES, DISTRICTS_BY_STATE } from '../utils/indiaLocations'

// Searchable dropdown used by the event form's list-backed fields.
//
// District has 784 values, so a native <select> is unusable — it is grouped by
// state (click District, get every district under its state) and searchable.
// State and Activity use the same control so they look and behave identically.
//
// Pass onCreate to allow values that are not in the list yet: the typed text
// then appears as a final "create this" row, which is how a brand new Activity
// is added without leaving the form.
export default function LocationSelect({
  value = '',
  onChange,
  groups,                 // [{ label, options: string[] }] — omit for a flat list
  options,
  placeholder = 'Select…',
  allowClear = true,
  disabled = false,
  createLabel = (v) => `+ Create "${v}"`,
  onCreate,               // (typedValue) => void — enables the create row
  footer,                 // extra content pinned under the list
  id,
  name,
  ariaLabel,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef(null)
  const searchRef = useRef(null)
  const listRef = useRef(null)

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (v) => !q || v.toLowerCase().includes(q)
    if (groups) {
      return groups
        .map((g) => ({ label: g.label, options: g.options.filter(match) }))
        .filter((g) => g.options.length)
    }
    return [{ label: '', options: (options || []).filter(match) }]
  }, [groups, options, query])

  const typed = query.trim()
  // Only offer to create when the text is not already an exact match, so
  // Enter picks the existing entry rather than silently making a duplicate.
  const exactExists = useMemo(() => {
    const t = typed.toLowerCase()
    if (!t) return true
    return list.some((g) => g.options.some((o) => o.toLowerCase() === t))
  }, [list, typed])
  const showCreate = Boolean(onCreate) && Boolean(typed) && !exactExists

  // Flattened view of what is currently reachable, so arrow keys move through
  // every visible option in reading order rather than skipping group headers.
  const flat = useMemo(() => {
    const out = []
    for (const g of list) for (const o of g.options) out.push({ group: g.label, option: o, create: false })
    if (showCreate) out.push({ group: '', option: typed, create: true })
    return out
  }, [list, showCreate, typed])

  useEffect(() => {
    if (!open) return
    setQuery('')
    const t = setTimeout(() => searchRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  // Reset the cursor whenever the filtered set changes, so Enter never picks a
  // highlighted option that is no longer on screen.
  useEffect(() => {
    setActiveIndex(0)
  }, [query, open])

  useEffect(() => {
    if (!open) return undefined
    const onDocDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector('[data-active="true"]')
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open, list])

  const pick = (entry) => {
    if (entry.create) onCreate(entry.option)
    else onChange?.(entry.option)
    setOpen(false)
  }

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (!open) return
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => (flat.length ? (i + 1) % flat.length : 0))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => (flat.length ? (i - 1 + flat.length) % flat.length : 0))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (flat[activeIndex]) pick(flat[activeIndex])
    }
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }} onKeyDown={onKeyDown}>
      <button
        type="button"
        id={id}
        name={name}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', fontSize: 14, fontFamily: 'inherit',
          color: value ? 'var(--eh-ink,#0f1128)' : 'var(--eh-ink-soft,#6a6f8f)',
          background: disabled ? 'rgba(0,0,0,.03)' : '#fff',
          border: `1px solid ${open ? 'var(--eh-primary,#2036bd)' : 'var(--eh-line,#e8e6f2)'}`,
          borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
          boxShadow: open ? '0 0 0 3px var(--eh-primary-soft,#e8ecfb)' : 'none',
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value || placeholder}
        </span>
        {value && allowClear && !disabled ? (
          <span
            role="button"
            aria-label="Clear"
            title="Clear"
            onClick={(e) => { e.stopPropagation(); onChange?.('') }}
            style={{ fontSize: 15, lineHeight: 1, color: 'var(--eh-ink-soft,#6a6f8f)', padding: '0 2px' }}
          >×</span>
        ) : null}
        <span aria-hidden="true" style={{ fontSize: 10, color: 'var(--eh-ink-soft,#6a6f8f)' }}>▼</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', zIndex: 60, top: 'calc(100% + 4px)', left: 0, right: 0,
            background: '#fff', border: '1px solid var(--eh-line,#e8e6f2)', borderRadius: 10,
            boxShadow: '0 12px 28px rgba(15,17,40,.16)', overflow: 'hidden',
          }}
        >
          <div style={{ padding: 8, borderBottom: '1px solid var(--eh-line,#e8e6f2)' }}>
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type to search…"
              style={{
                width: '100%', padding: '6px 9px', fontSize: 13, fontFamily: 'inherit',
                border: '1px solid var(--eh-line,#e8e6f2)', borderRadius: 7, outline: 'none',
              }}
            />
          </div>
          <div ref={listRef} role="listbox" style={{ maxHeight: 260, overflowY: 'auto', padding: 4 }}>
            {flat.length === 0 ? (
              <div style={{ padding: 14, fontSize: 12.5, color: 'var(--eh-ink-soft,#6a6f8f)', textAlign: 'center' }}>
                {onCreate ? 'Type a name to add a new one' : 'No match found'}
              </div>
            ) : (
              flat.map((entry, i) => {
                const showHeader = entry.group && entry.group !== flat[i - 1]?.group
                const isActive = i === activeIndex
                return (
                  <div key={(entry.create ? 'new|' : entry.group + '|') + entry.option}>
                    {showHeader && (
                      <div style={{
                        padding: '7px 10px 4px', fontSize: 10.5, fontWeight: 800,
                        letterSpacing: '.04em', textTransform: 'uppercase',
                        color: 'var(--eh-ink-soft,#6a6f8f)', background: 'var(--eh-surface-1,#f6f7f9)',
                        position: 'sticky', top: 0, zIndex: 1,
                      }}>{entry.group}</div>
                    )}
                    <div
                      role="option"
                      aria-selected={!entry.create && value === entry.option}
                      data-active={isActive}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => pick(entry)}
                      style={{
                        padding: '6px 10px', fontSize: 13, cursor: 'pointer',
                        background: isActive ? 'var(--eh-primary-soft,#e8ecfb)' : 'transparent',
                        color: entry.create ? 'var(--eh-primary,#2036bd)' : 'var(--eh-ink,#0f1128)',
                        fontWeight: !entry.create && value === entry.option ? 700 : entry.create ? 600 : 400,
                      }}
                    >{entry.create ? createLabel(entry.option) : entry.option}</div>
                  </div>
                )
              })
            )}
          </div>
          {footer ? (
            <div style={{
              padding: '7px 10px', borderTop: '1px solid var(--eh-line,#e8e6f2)',
              fontSize: 11.5, color: 'var(--eh-ink-soft,#6a6f8f)', background: 'var(--eh-surface-1,#f6f7f9)',
            }}>{footer}</div>
          ) : null}
        </div>
      )}
    </div>
  )
}

// Ready-made wiring: districts grouped by state, and the flat state list.
export const DistrictSelect = (props) => (
  <LocationSelect
    {...props}
    groups={STATES.map(s => ({ label: s, options: DISTRICTS_BY_STATE[s] }))}
  />
)

export const StateSelect = (props) => <LocationSelect {...props} options={STATES} />
