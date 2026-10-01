import { useState } from 'react'

/**
 * One criterion's 1..5 rating.
 *
 * Built as a radiogroup rather than five separate buttons so it is a single
 * tab stop and arrow keys move between the stars — on a phone held one-handed
 * mid-event, tapping the exact star four times in the right place is the part
 * that goes wrong.
 */
export default function StarRow({ name, label, labels = [], value, onChange, disabled = false }) {
  const [focused, setFocused] = useState(value || 0)

  const move = (delta) => {
    const next = Math.min(5, Math.max(1, (focused || 1) + delta))
    setFocused(next)
    if (!disabled) onChange(next)
  }

  const onKeyDown = (e) => {
    const map = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
    }
    if (e.key === 'Home') {
      e.preventDefault()
      setFocused(1)
      if (!disabled) onChange(1)
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      setFocused(5)
      if (!disabled) onChange(5)
      return
    }
    const delta = map[e.key]
    if (!delta) return
    e.preventDefault()
    move(delta)
  }

  return (
    <fieldset className="criterion" disabled={disabled}>
      <legend className="criterion-label">
        {label}
        {value ? <span className="criterion-value">{labels[value - 1]}</span> : null}
      </legend>

      <div
        className="stars"
        role="radiogroup"
        aria-label={label}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused((f) => f || value || 1)}
      >
        {labels.map((_, i) => {
          const n = i + 1
          const on = n <= value
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === value}
              aria-label={`${n} of 5${labels[i] ? `, ${labels[i]}` : ''}`}
              className={`star${on ? ' is-on' : ''}${disabled ? ' is-locked' : ''}`}
              disabled={disabled}
              onClick={() => onChange(n)}
            >
              <Star filled={on} />
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function Star({ filled }) {
  return (
    <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true" focusable="false">
      <path
        d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.45 6.19 20.5l1.11-6.47-4.7-4.58 6.5-.95L12 2.6z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The three timing choices. A radio group, for the same reason the stars are. */
export function TimingChoice({ value, onChange, options, disabled = false }) {
  const onKeyDown = (e) => {
    if (disabled) return
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return
    e.preventDefault()
    const i = options.findIndex((o) => o.key === value)
    const next = options[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]
    onChange(next.key)
  }

  return (
    <fieldset className="criterion" disabled={disabled}>
      <legend className="criterion-label">
        Time taken
        {value
          ? <span className="criterion-value">{options.find((o) => o.key === value)?.label}</span>
          : null}
      </legend>

      <div
        className="timing"
        role="radiogroup"
        aria-label="Time taken"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKeyDown}
      >
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={o.key === value}
            className={`timing-opt${o.key === value ? ' is-on' : ''}`}
            disabled={disabled}
            onClick={() => onChange(o.key)}
          >
            <span className="timing-label">{o.label}</span>
            <span className="timing-hint">{o.hint}</span>
          </button>
        ))}
      </div>
    </fieldset>
  )
}