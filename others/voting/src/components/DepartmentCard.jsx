import { ArrowRight, Check, DepartmentIcon } from '../icons'
import { departmentAccent } from '../helpers'

/**
 * One department tile, used by the dashboard, the post-vote confirmation and
 * the completion screen so the same department always looks the same.
 *
 * The accent is applied through CSS custom properties so a card is a single
 * element with one class plus one modifier, rather than six inline colour
 * strings repeated in three components.
 */
export default function DepartmentCard({ department, onClick, interactive = false }) {
  const accent = departmentAccent(department)
  const voted = !!department.voted
  const closed = !department.open && !voted

  const style = {
    '--dept-base': accent.base,
    '--dept-soft': accent.soft,
    '--dept-edge': accent.edge,
  }

  const className = [
    'dept-card',
    voted ? 'is-voted' : '',
    closed ? 'is-closed' : '',
    interactive && !voted && !closed ? 'is-clickable' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const inner = (
    <>
      <span className="dept-card-icon">
        <DepartmentIcon name={department.name} size={24} aria-hidden="true" focusable="false" />
      </span>
      <span className="dept-card-name">{department.name}</span>
      <span className="dept-card-state">
        {voted ? (
          <>
            <Check size={13} aria-hidden="true" focusable="false" />
            Voted
          </>
        ) : closed ? (
          'Closed'
        ) : (
          <>
            Vote
            <ArrowRight size={13} aria-hidden="true" focusable="false" />
          </>
        )}
      </span>
    </>
  )

  // The dashboard needs a real button so it is reachable by keyboard; the
  // confirmation and completion screens show the same card as read-only state.
  if (!interactive) {
    return (
      <div className={className} style={style}>
        {inner}
      </div>
    )
  }

  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={() => onClick(department)}
      disabled={voted || closed}
    >
      {inner}
    </button>
  )
}
