import { useEffect, useMemo, useState } from 'react'
import { accentFor, formatCountdown, secondsUntil } from '../helpers'

/**
 * The whole voter flow in one screen: every department, each with a Vote button.
 *
 * There is no running order and nobody waits — all the ballots are open for the
 * whole ceremony, so this is a menu, not a queue. After voting in one
 * department the booth drops you straight into the next one you have not voted
 * in yet, so the common case is tap, tap, tap.
 */
export default function DepartmentGrid({ ceremony, onVote }) {
  const { session, departments = [], closes_at: closesAt } = ceremony || {}
  const [left, setLeft] = useState(() => secondsUntil(closesAt))

  useEffect(() => {
    if (!closesAt) return undefined
    setLeft(secondsUntil(closesAt))
    const id = setInterval(() => setLeft(secondsUntil(closesAt)), 1000)
    return () => clearInterval(id)
  }, [closesAt])

  const remaining = departments.filter((d) => !d.voted)
  const done = departments.length - remaining.length
  const expired = closesAt ? left <= 0 : false

  const progress = useMemo(
    () => (departments.length ? Math.round((done / departments.length) * 100) : 0),
    [done, departments.length],
  )

  if (expired) {
    return (
      <div className="card">
        <div className="center">
          <div className="eyebrow">Time up</div>
          <h1 className="big">Voting has closed</h1>
          <p className="lede">Thank you for voting. Hold on — the winners are being worked out now.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="card wide">
      <div className="center">
        <div className="eyebrow">{session?.award_label || 'Award Ceremony'}</div>
        <h1 className="big">{session?.title || 'Vote'}</h1>
        <p className="lede">
          {remaining.length
            ? 'Pick a department and vote for one person on their list. You can vote in every department.'
            : 'You have voted in every department. Thank you!'}
        </p>
      </div>

      {closesAt ? (
        <div className="grid-timer">
          <div>
            <div className="eyebrow">Voting closes in</div>
            <div className="countdown">{formatCountdown(left)}</div>
          </div>
          <div className="grid-progress">
            <div className="grid-progress-label">
              {done} of {departments.length} voted
            </div>
            <div className="bar">
              <div className="bar-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      ) : null}

      <div className="dept-grid">
        {departments.map((d) => {
          const accent = accentFor(d.order_index ?? 0)
          return (
            <button
              key={d.id}
              type="button"
              className={`dept-tile${d.voted ? ' done' : ''}`}
              style={{ borderTopColor: `hsl(${accent.hue} 45% 46%)` }}
              onClick={() => onVote(d)}
              disabled={d.voted || !d.open}
            >
              <span className="dept-tile-name">{d.name}</span>
              <span className="dept-tile-state">{d.voted ? 'Voted ✓' : d.open ? 'Vote' : 'Closed'}</span>
            </button>
          )
        })}
      </div>

      <p className="hint center">
        Tap <strong>Vote</strong>, pick one person, submit — then it takes you to the next department.
        Your vote is anonymous and cannot be changed.
      </p>
    </div>
  )
}
