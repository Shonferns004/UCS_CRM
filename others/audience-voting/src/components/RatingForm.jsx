import { useMemo, useState } from 'react'
import { STAR_LABELS, TIMING_OPTIONS, initials } from '../helpers'
import StarRow, { TimingChoice } from './StarRow'

/** The five criteria in the order they are rated, mapped to their star labels. */
const CRITERIA = [
  { key: 'delivery', label: 'Way of delivering the speech' },
  { key: 'confidence', label: 'Stage confidence' },
  { key: 'clarity', label: 'Clarity of words' },
  { key: 'relevance', label: 'Related to the topic' },
]

/**
 * The rating sheet for whoever is on stage.
 *
 * Submit is disabled until all five are answered, but there is no live "you have
 * missed one" message — the button simply stays off. Pointing at which star row
 * is empty while somebody is standing in front of a room waiting to be rated is
 * feedback the rater cannot act on.
 */
export default function RatingForm({ participant, onSubmit, busy, error }) {
  const [scores, setScores] = useState({})
  const [comment, setComment] = useState('')

  const timing = scores.timing
  const starDone = CRITERIA.every((c) => scores[c.key] >= 1)
  const complete = starDone && !!timing
  const remaining = 5 - (CRITERIA.filter((c) => scores[c.key] >= 1).length + (timing ? 1 : 0))

  const set = (key) => (v) => setScores((s) => ({ ...s, [key]: v }))

  const submit = (e) => {
    e.preventDefault()
    if (!complete || busy) return
    onSubmit({
      participantId: participant.id,
      delivery: scores.delivery,
      confidence: scores.confidence,
      clarity: scores.clarity,
      relevance: scores.relevance,
      timing,
      comment: comment.trim(),
    })
  }

  return (
    <main className="stage">
      <form className="card rate-card" onSubmit={submit}>
        <header className="rate-head">
          <span className="portrait" aria-hidden="true">
            {initials(participant.name)}
          </span>
          <div className="rate-head-text">
            <span className="eyebrow">Now on stage</span>
            <h1 className="title">{participant.name}</h1>
            <p className="lede lede-tight">Rate this speaker on each of the five points below.</p>
          </div>
        </header>

        <div className="criteria">
          {CRITERIA.map((c) => (
            <StarRow
              key={c.key}
              name={c.key}
              label={c.label}
              labels={STAR_LABELS[c.key]}
              value={scores[c.key] || 0}
              onChange={set(c.key)}
              disabled={busy}
            />
          ))}

          <TimingChoice
            value={timing}
            onChange={set('timing')}
            options={TIMING_OPTIONS}
            disabled={busy}
          />
        </div>

        <label className="field">
          <span className="field-label">
            Anything to add? <span className="field-optional">optional</span>
          </span>
          <textarea
            className="input textarea"
            rows={2}
            maxLength={1000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="One thing that stood out, good or not"
            disabled={busy}
          />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="rate-foot">
          <span className="rate-progress" role="status">
            {complete ? 'All five rated' : `${remaining} to go`}
          </span>
          <button className="btn btn-primary" type="submit" disabled={busy || !complete}>
            {busy ? 'Saving…' : 'Submit rating'}
          </button>
        </div>
      </form>
    </main>
  )
}