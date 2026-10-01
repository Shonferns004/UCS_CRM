import { ArrowRight, Check, DepartmentIcon } from '../icons'
import { departmentAccent } from '../helpers'

/**
 * One department tile, used by the dashboard, the post-vote confirmation and
 * the completion screen so the same department always looks the same.
 *
 * The accent is applied through CSS custom properties so a card is a single
 * element with one class plus one modifier, rather than six inline colour
 * strings repeated in three components.
 *
 * The whole card is the target. On the dashboard it is a real button, so it is
 * reachable and operable by keyboard with one stop, and its accessible name is
 * built from the two words on it ("FRO Vote now"). On the confirmation and
 * completion screens the same card is rendered read-only.
 */
export default function DepartmentCard({ department, onClick, interactive = false }) {
  const accent = departmentAccent(department)
  const voted = !!department.voted
  const closed = !department.open && !voted

  const style = {
    '--dept-base': accent.base,
    '--dept-soft': accent.soft,
    '--dept-edge': accent.edge,
    '--dept-ink': accent.ink,
    '--dept-cta': accent.cta || accent.ink,
  }

  const className = [
    'dept-card',
    voted ? 'is-voted' : '',
    closed ? 'is-closed' : '',
    interactive && !voted && !closed ? 'is-clickable' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const state = voted ? 'Voted' : closed ? 'Closed' : 'Vote now'

  const inner = (
    <>
      <span className="dept-card-top">
        <span className="dept-card-icon">
          <DepartmentIcon name={department.name} size={26} aria-hidden="true" focusable="false" />
        </span>
        <span className="dept-card-name">{department.name}</span>
      </span>

      {/* One slot for both the call to action and the finished/closed state, so
          every card is the same height whatever it is showing. The state word
          is real text, not a picture of one: it is what gives the button its
          accessible name, and it is the only thing a screen reader has to go on
          once the card is read-only. */}
      <span className="dept-card-cta">
        {state}
        {voted ? (
          <Check size={15} aria-hidden="true" focusable="false" />
        ) : closed ? null : (
          <ArrowRight size={15} aria-hidden="true" focusable="false" />
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