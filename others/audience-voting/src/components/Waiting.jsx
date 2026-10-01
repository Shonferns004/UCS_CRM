import { Mic } from '../icons'

/**
 * Shown while nothing is running, or between speakers.
 *
 * This is a normal resting state, not an error, and the two are worded
 * differently on purpose: before the event opens it has to say "keep this page
 * open", while a gap between speakers has to say "you are done, wait here" —
 * otherwise a phone that lands mid-gap reads as broken and the rater gives up.
 */
export default function Waiting({ live, onRetry, voterCount }) {
  return (
    <main className="stage stage-centre">
      <div className="card wait-card">
        <span className="wait-icon" aria-hidden="true">
          <Mic size={40} />
        </span>
        <h1 className="title">
          {live ? 'Waiting for the next speaker' : 'Voting has not started yet'}
        </h1>
        <p className="lede">
          {live
            ? 'Nothing to do right now. The next speaker will appear here on its own.'
            : 'Keep this page open. It will bring up the speaker automatically as soon as the organiser starts.'}
        </p>

        {voterCount > 0 && (
          <p className="wait-count">
            {voterCount} {voterCount === 1 ? 'person has' : 'people have'} joined
          </p>
        )}

        <button className="btn btn-ghost" type="button" onClick={onRetry}>
          Check again
        </button>
      </div>
    </main>
  )
}