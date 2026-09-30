import { accentFor, initials } from '../helpers'

/**
 * The end-of-ceremony reveal. Shown only once the voting window has closed and
 * HR has finished the ceremony — through the ceremony itself the booth shows
 * nothing about how the vote is going, because the winner is decided after
 * everyone has voted.
 */
export default function Results({ ceremony }) {
  const { session, results = [] } = ceremony || {}
  const anyWinner = results.some((r) => r.winner)

  return (
      <div className="panel">
        <div className="panel-center">
          <div className="eyebrow">Results</div>
          <h1 className="panel-title">{session?.title || 'Award Ceremony'}</h1>
        <p className="lede">
          {anyWinner
            ? 'Every department has had its turn and all the time is up. Here is who everyone picked.'
            : 'The ceremony is finished. No votes were recorded, so there are no winners to show.'}
        </p>
      </div>

      {anyWinner ? (
        <div className="results">
          {results.map((r) => {
            const accent = accentFor(r.department?.order_index ?? 0)
            return (
              <div
                key={r.department?.id}
                className="result-card"
                style={{ borderTopColor: `hsl(${accent.hue} 45% 46%)` }}
              >
                <div className="eyebrow">{r.department?.name}</div>
                {r.winner ? (
                  <div className="result-winner">
                    <span className="avatar" style={{ background: `hsl(${accent.hue} 45% 46%)` }}>
                      {r.winner.photo_url ? <img src={r.winner.photo_url} alt="" /> : initials(r.winner.name)}
                    </span>
                    <div className="rname">{r.winner.name}</div>
                    <div className="rsub">
                      {r.winner.votes} {r.winner.votes === 1 ? 'vote' : 'votes'}
                      {r.is_tie ? ` · tied with ${r.tied_count - 1} other${r.tied_count > 2 ? 's' : ''}` : ''}
                    </div>
                  </div>
                ) : (
                  <div className="rsub">No votes recorded</div>
                )}
              </div>
            )
          })}
        </div>
      ) : results.some((r) => r.votes_cast === 0) ? (
        <div className="alert alert-warn">
          Nobody cast a ballot this time. HR can still award the ceremony manually if they wish.
        </div>
      ) : null
      }

      <p className="hint hint-center">
        Thanks to everyone who voted. Ballots were anonymous, so no one — including HR — can see how any
        single person voted.
      </p>
    </div>
  )
}