import { useEffect, useState } from 'react'
import { formatCountdown, secondsUntil } from '../helpers'
import OrderStrip from './OrderStrip'

/**
 * Everything the voter sees that is not their ballot: no ceremony yet, not
 * started, another department up, or their own turn already gone. The branch is
 * chosen by the server from the real turn state.
 */
export default function WaitingRoom({ ceremony, state }) {
  const { session, department, departments, turn, already_voted, roster_size: rosterSize } = ceremony || {}

  const [left, setLeft] = useState(() => secondsUntil(turn?.closes_at))

  // Only worth a ticking clock in the one case where there is a deadline to
  // watch: your turn is live but you have not voted yet.
  const live = state === 'voting'
  useEffect(() => {
    if (!live || !turn?.closes_at) return undefined
    setLeft(secondsUntil(turn.closes_at))
    const id = setInterval(() => setLeft(secondsUntil(turn.closes_at)), 1000)
    return () => clearInterval(id)
  }, [live, turn?.closes_at])

  const copy = {
    not_started: {
      eyebrow: 'Not started yet',
      title: session?.title || 'Award Ceremony',
      body: 'HR has set up the ceremony but has not opened the first turn yet. This page will bring you straight to your ballot when your department is called.',
    },
    waiting: {
      eyebrow: 'Please wait',
      title: department ? `${department.name} has not been called yet` : 'Waiting for your turn',
      body: `Departments vote one after another. You will be able to vote when ${department?.name || 'your department'} opens — the page updates on its own, so you can leave this open.`,
    },
    missed: {
      eyebrow: 'Voting closed',
      title: 'Your department’s turn is over',
      body: 'You did not submit a ballot before the window closed. Votes are anonymous, so we cannot tell who did and did not vote.',
    },
    voted: {
      eyebrow: 'Vote recorded',
      title: 'Thank you — your vote is in',
      body: 'Your ballot has been recorded. Nothing further is needed from you, and no one can see how you voted.',
    },
    not_in_ceremony: {
      eyebrow: 'Not participating',
      title: 'Your department is not in this ceremony',
      body: 'Only the departments taking part are called in turn. If you think this is wrong, please tell HR.',
    },
    no_ceremony: {
      eyebrow: 'Nothing running',
      title: 'No ceremony is live right now',
      body: 'When HR opens the award ceremony, your department’s ballot will appear here.',
    },
  }[state] || {
    eyebrow: 'Award Ceremony',
    title: session?.title || 'Award Ceremony',
    body: 'Please wait for HR to open your department’s turn.',
  }

  return (
    <div className="card">
      <div className="eyebrow">{copy.eyebrow}</div>
      <h1 className="big">{copy.title}</h1>
      <p className="lede">{copy.body}</p>

      {live && (
        <div className="center" style={{ margin: '22px 0 4px' }}>
          <div className={`countdown${left <= 30 ? ' warn' : ''}`}>{formatCountdown(left)}</div>
          <div className="countdown-label">left to vote</div>
        </div>
      )}

      {already_voted && state === 'voted' && (
        <div className="alert alert-ok">Your ballot was recorded. You can close this page.</div>
      )}

      {state === 'not_in_ceremony' && (
        <div className="alert alert-warn">
          This ceremony is running for {session?.title || 'the current award'}. Your department was not
          included in the running order.
        </div>
      )}

      {department && rosterSize > 0 && (
        <p className="hint">
          {rosterSize} {rosterSize === 1 ? 'person is' : 'people are'} on your department’s ballot.
        </p>
      )}

      <OrderStrip departments={departments} myDepartmentId={department?.id} />

      {session?.turn_minutes ? (
        <p className="hint">Each department gets {session.turn_minutes} minutes.</p>
      ) : null}
    </div>
  )
}
