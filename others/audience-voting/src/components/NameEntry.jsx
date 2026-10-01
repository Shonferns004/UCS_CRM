import { useState } from 'react'

/**
 * The first thing a rater sees: their name.
 *
 * One field and one button, because the audience is walking up to a phone in a
 * hallway and will not be filling in a form.
 */
export default function NameEntry({ onSubmit, busy, error }) {
  const [name, setName] = useState('')
  const trimmed = name.trim()

  const submit = (e) => {
    e.preventDefault()
    if (!trimmed || busy) return
    onSubmit(trimmed)
  }

  return (
    <main className="stage">
      <form className="card name-card" onSubmit={submit}>
        <h1 className="title">What is your name?</h1>
        <p className="lede">Your name is shown to the organiser only, so they know how many people took part.</p>

        <label className="field">
          <span className="field-label">Your name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Priya Nair"
            autoComplete="name"
            autoCapitalize="words"
            autoFocus
            aria-describedby={error ? 'name-error' : undefined}
          />
        </label>

        {error && (
          <p className="error" id="name-error" role="alert">
            {error}
          </p>
        )}

        <button className="btn btn-primary btn-block" type="submit" disabled={busy || !trimmed}>
          {busy ? 'Joining…' : 'Continue'}
        </button>
      </form>
    </main>
  )
}