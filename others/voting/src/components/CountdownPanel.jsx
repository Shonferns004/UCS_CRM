import { useEffect, useState } from 'react'
import { formatCountdown, secondsUntil } from '../helpers'

/**
 * The live clock, shared by the dashboard, ballot, confirmation and completion
 * screens. Always driven by the server-corrected closes_at - there are no
 * hardcoded durations here.
 *
 * The timer is kept tabular-nums and given a fixed min-width per unit so the
 * digits changing every second cannot shuffle the layout.
 */
export function useCountdown(closesAt) {
  const [left, setLeft] = useState(() => secondsUntil(closesAt))

  useEffect(() => {
    if (!closesAt) return undefined
    setLeft(secondsUntil(closesAt))
    const id = setInterval(() => setLeft(secondsUntil(closesAt)), 1000)
    return () => clearInterval(id)
  }, [closesAt])

  return left
}

/**
 * Countdown on the left, progress on the right. `done`/`total` come from the
 * ceremony payload, so the "x of y voted" text is never a constant.
 */
export default function CountdownPanel({ closesAt, done = 0, total = 0, label = 'Voting closes in' }) {
  const left = useCountdown(closesAt)
  const expired = !!closesAt && left <= 0
  const progress = total > 0 ? Math.round((done / total) * 100) : 0

  if (!closesAt) return null

  return (
    <div className="count-panel">
      <div className="count-panel-clock">
        <span className="count-panel-label">{label}</span>
        <span className={`count-panel-timer${expired ? ' is-over' : ''}`}>
          {expired ? 'Closed' : formatCountdown(left)}
        </span>
      </div>

      <div className="count-panel-progress">
        <div className="count-panel-progress-head">
          <span className="count-panel-label">Your progress</span>
          <span className="count-panel-count">
            {done} of {total} voted
          </span>
        </div>
        <div
          className="count-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label="Departments you have voted in"
        >
          <div className="count-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  )
}
