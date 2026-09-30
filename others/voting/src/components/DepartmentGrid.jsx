import CountdownPanel from './CountdownPanel'
import DepartmentCard from './DepartmentCard'

/**
 * The department dashboard: every department, each with its own state.
 *
 * There is no running order and nobody waits — all the ballots are open for the
 * whole ceremony, so this is a menu, not a queue. After voting in one
 * department the booth drops you straight into the next one you have not voted
 * in yet, so the common case is tap, tap, tap.
 *
 * The department list, the voted flags and the countdown all come from the
 * ceremony payload; nothing about the count or the names is hardcoded here.
 */
export default function DepartmentGrid({ ceremony, onVote }) {
  const { session, departments = [], closes_at: closesAt } = ceremony || {}

  const total = departments.length
  const done = departments.filter((d) => d.voted).length
  const allDone = total > 0 && done === total

  return (
    <section className="panel">
      <div className="panel-center">
        <span className="eyebrow">{session?.award_label || 'Star of the Department'}</span>
        <h1 className="panel-title">{session?.title || 'Monthly Award Ceremony'}</h1>
        <p className="lede">
          {allDone
            ? 'You have voted in every department. Thank you!'
            : 'Pick a department and vote for one person on their list. You can vote in every department.'}
        </p>
      </div>

      <CountdownPanel closesAt={closesAt} done={done} total={total} />

      <div className="dept-grid">
        {departments.map((d) => (
          <DepartmentCard key={d.id} department={d} onClick={onVote} interactive />
        ))}
      </div>

      <p className="hint hint-center">
        Tap <strong>Vote</strong>, pick one person, submit — then it takes you to the next department. Your
        vote is anonymous and cannot be changed.
      </p>
    </section>
  )
}
