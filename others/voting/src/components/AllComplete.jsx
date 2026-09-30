import CountdownPanel from './CountdownPanel'
import DepartmentCard from './DepartmentCard'
import { Check } from '../icons'

/**
 * Every eligible department has a vote in. This is the end of the voter's part
 * of the ceremony, so there is no Next Department action here — the only way on
 * is signing out. Kept deliberately plain: a celebratory treatment that blocks
 * people who just want to get back to work is a worse bug than a dull screen.
 */
export default function AllComplete({ ceremony }) {
  const { session, departments = [], closes_at: closesAt } = ceremony || {}
  const total = departments.length
  const done = departments.filter((d) => d.voted).length

  return (
    <section className="panel">
      <div className="panel-center">
        <span className="success-seal" aria-hidden="true">
          <Check size={34} />
        </span>
        <h1 className="panel-title">{session?.title || 'Monthly Award Ceremony'}</h1>
        <p className="lede">You have voted in every department. Thank you!</p>
      </div>

      <CountdownPanel closesAt={closesAt} done={done} total={total} />

      <div className="dept-grid">
        {departments.map((d) => (
          <DepartmentCard key={d.id} department={d} />
        ))}
      </div>

      <p className="hint hint-center">
        Your vote is anonymous and cannot be changed. Thank you for being a part of this month's
        recognition.
      </p>
    </section>
  )
}
