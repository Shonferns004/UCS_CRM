import { Check } from '../icons'
import { initials } from '../helpers'

/**
 * Confirmation after a rating is stored.
 *
 * Deliberately not a "thank you, you may close this page" dead end. The rating
 * is one per speaker, so the only thing left to do is wait for the next name —
 * saying so here is what stops somebody from tapping back and finding their own
 * rating rejected.
 */
export default function RatedDone({ participant, nextUp, onCheckAgain }) {
  return (
    <main className="stage stage-centre">
      <div className="card done-card">
        <span className="done-tick" aria-hidden="true">
          <Check size={30} />
        </span>
        <h1 className="title">Rating submitted</h1>

        <div className="done-speaker">
          <span className="portrait portrait-sm" aria-hidden="true">
            {initials(participant.name)}
          </span>
          <span>
            You rated <strong>{participant.name}</strong>
          </span>
        </div>

        <p className="lede">
          {nextUp
            ? `Next up: ${nextUp}. This page will switch by itself.`
            : 'That was the last speaker. You can close this page.'}
        </p>

        <button className="btn btn-ghost" type="button" onClick={onCheckAgain}>
          Check for the next speaker
        </button>
      </div>
    </main>
  )
}