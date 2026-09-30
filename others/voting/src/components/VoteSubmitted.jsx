import CountdownPanel from './CountdownPanel'
import DepartmentCard from './DepartmentCard'
import { ArrowRight, Check } from '../icons'

/**
 * Confirmation after a ballot is accepted, before the next department.
 *
 * Deliberately does NOT name the candidate: the server never echoes the nominee
 * back, and repeating it here on a shared screen would undo the promise the
 * intro makes. The voter is told the department is done, nothing more.
 */
export default function VoteSubmitted({ ceremony, lastDepartment, onNext, nextDepartment }) {
  const { departments = [], closes_at: closesAt } = ceremony || {}
  const total = departments.length
  const done = departments.filter((d) => d.voted).length
  const allDone = nextDepartment == null

  return (
    <section className="panel">
      <div className="panel-center">
        <span className="success-seal" aria-hidden="true">
          <Check size={34} />
        </span>
        <h1 className="panel-title">Vote Submitted!</h1>
        <p className="lede">
          Your vote in {lastDepartment?.name || 'this department'} has been recorded. Thank you!
        </p>
      </div>

      <CountdownPanel closesAt={closesAt} done={done} total={total} />

      <div className="dept-grid">
        {departments.map((d) => (
          <DepartmentCard key={d.id} department={d} />
        ))}
      </div>

      <div className="panel-actions">
        {allDone ? (
          <p className="hint hint-center">You have voted in every department. Thank you!</p>
        ) : (
          <button className="btn btn-gold btn-tall btn-wide" onClick={() => onNext(nextDepartment)}>
            Next Department
            <ArrowRight size={16} aria-hidden="true" focusable="false" />
          </button>
        )}
      </div>

      <p className="hint hint-center">
        Your vote is anonymous — no one, including HR, can see which ballot was yours.
      </p>
    </section>
  )
}
