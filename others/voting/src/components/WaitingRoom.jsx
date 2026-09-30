/**
 * The two states that are not "voting": no ceremony at all, or HR has set one up
 * but not pressed start. There is no waiting for a turn any more — all the
 * ballots open together — so this screen is purely the pre-voting holding page.
 */
export default function WaitingRoom({ ceremony, state }) {
  const { session } = ceremony || {}

  const copy = {
    not_started: {
      eyebrow: 'Not started yet',
      title: session?.title || 'Award Ceremony',
      body: 'HR has set up the ceremony. As soon as they press start, every department’s ballot appears here — this page updates on its own.',
    },
    no_ceremony: {
      eyebrow: 'Nothing running',
      title: 'No ceremony is live right now',
      body: 'When HR opens the award ceremony, the list of departments will appear here.',
    },
  }[state] || {
    eyebrow: 'Award Ceremony',
    title: session?.title || 'Award Ceremony',
    body: 'Please wait for HR to start the ceremony.',
  }

  return (
    <div className="panel panel-narrow">
      <div className="eyebrow">{copy.eyebrow}</div>
      <h1 className="panel-title">{copy.title}</h1>
      <p className="lede">{copy.body}</p>
      <div className="alert alert-ok">
        {state === 'not_started'
          ? 'You can leave this page open — it will switch to the ballots by itself.'
          : 'You do not need to do anything yet.'}
      </div>
    </div>
  )
}
