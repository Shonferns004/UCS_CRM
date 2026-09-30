import { accentFor } from '../helpers'

/**
 * The ceremony running order, so someone waiting can see where they sit in the
 * queue. State comes from the API, never from the local clock.
 */
export default function OrderStrip({ departments = [], myDepartmentId }) {
  if (!departments.length) return null
  const sorted = [...departments].sort((a, b) => a.order_index - b.order_index)

  return (
    <ol className="order">
      {sorted.map((d) => {
        const isNow = Number(d.id) === Number(myDepartmentId)
        const done = d.turn_status === 'closed'
        const accent = accentFor(d.order_index)
        return (
          <li key={d.id} className={`${done ? 'is-done' : ''} ${isNow ? 'is-now' : ''}`}>
            <span
              className="dot"
              style={{ background: done ? 'var(--ok)' : `hsl(${accent.hue} 78% 55%)` }}
            >
              {done ? '✓' : d.order_index + 1}
            </span>
            {d.name}
            {isNow && <strong>· your turn</strong>}
          </li>
        )
      })}
    </ol>
  )
}
