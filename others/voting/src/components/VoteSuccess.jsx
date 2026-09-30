/** Shown straight after a successful submit, and whenever a voter has already voted. */
export default function VoteSuccess({ ceremony }) {
  const { session, department } = ceremony || {}

  return (
    <div className="card">
      <div className="center">
        <div className="seal" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="eyebrow">Vote recorded</div>
        <h1 className="big">Thank you for voting</h1>
        <p className="lede">
          {department
            ? `Your ballot for ${department.name} has been recorded.`
            : 'Your ballot has been recorded.'}{' '}
          You can close this page now — there is nothing else to do.
        </p>
      </div>

      <div className="alert alert-ok">
        Your vote is anonymous. It is stored as a count against the person you chose, and no one — including
        HR — can see which ballot was yours. The winner is decided only after every department has voted and
        the time is up.
      </div>

      {session?.award_label && <p className="hint">Award: {session.award_label}</p>}
    </div>
  )
}
