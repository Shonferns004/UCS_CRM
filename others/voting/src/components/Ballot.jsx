import { useEffect, useMemo, useState } from 'react'
import { castVote, fetchBallot } from '../api'
import { accentFor, formatCountdown, initials, secondsUntil } from '../helpers'
import { toast } from './Toast'

/** Pick exactly one person. The list is only ever populated while the turn is open. */
export default function Ballot({ onVoted }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState(null)
  const [busy, setBusy] = useState(false)
  const [left, setLeft] = useState(0)

  useEffect(() => {
    let alive = true
    fetchBallot()
      .then((d) => {
        if (!alive) return
        setData(d)
        setLeft(secondsUntil(d.turn?.closes_at))
      })
      .catch((e) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!data?.turn?.closes_at) return undefined
    setLeft(secondsUntil(data.turn.closes_at))
    const id = setInterval(() => setLeft(secondsUntil(data.turn.closes_at)), 1000)
    return () => clearInterval(id)
  }, [data?.turn?.closes_at])

  // The window can run out while this screen is open. The server would reject
  // the submit anyway; stopping the button early is a clearer message.
  const expired = left <= 0

  const accent = useMemo(() => accentFor(data?.department?.order_index ?? 0), [data?.department?.order_index])

  async function submit() {
    if (!picked || busy) return
    setBusy(true)
    setError('')
    try {
      await castVote(picked)
      toast('Vote recorded', 'success')
      onVoted()
    } catch (e) {
      setError(e.message)
      // 409 is either "already voted" or "window closed" - in both cases this
      // screen is finished and the parent needs to re-check the real state.
      if (e.status === 409) onVoted()
    } finally {
      setBusy(false)
    }
  }

  if (error && !data) {
    return (
      <div className="card">
        <div className="alert alert-error">{error}</div>
        <button className="btn" onClick={onVoted}>
          Back
        </button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="card">
        <div className="spinner dark" />
      </div>
    )
  }

  return (
    <div className="card wide">
      <div className="eyebrow">
        {data.session?.award_label} · {data.department?.name}
      </div>
      <h1 className="big">{data.session?.title}</h1>
      <p className="lede">
        Choose the one person you want to recognise from your department. You can select only one, and
        your vote cannot be changed afterwards.
      </p>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '11px 14px',
          borderRadius: 10,
          background: `hsl(${accent.hue} 70% 97%)`,
          border: `1px solid hsl(${accent.hue} 55% 86%)`,
          marginBottom: 18,
        }}
      >
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)' }}>
            Time left
          </div>
          <div className="countdown" style={{ fontSize: 26, color: expired ? 'var(--danger)' : 'inherit' }}>
            {expired ? 'Closed' : formatCountdown(left)}
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {data.nominees.length === 0 ? (
        <div className="alert alert-warn">
          There is nobody on your department’s ballot right now. Please tell HR.
        </div>
      ) : (
        <div className="ballot">
          {data.nominees.map((n) => {
            const on = picked === n.id
            return (
              <button
                key={n.id}
                type="button"
                className={`nominee${on ? ' selected' : ''}`}
                onClick={() => setPicked(n.id)}
                disabled={expired}
                aria-pressed={on}
              >
                <span className="avatar" style={{ background: `hsl(${accent.hue} 45% 46%)` }}>
                  {n.photo_url ? <img src={n.photo_url} alt="" /> : initials(n.name)}
                </span>
                <span className="meta">
                  <span className="nm">{n.name}</span>
                  <span className="sub">
                    {n.employee_id ? `${n.employee_id} · ` : ''}
                    {n.team || n.department}
                  </span>
                </span>
                <span className="radio" aria-hidden="true" />
              </button>
            )
          })}
        </div>
      )}

      <div className="submit-bar">
        <span className="grow">
          {expired ? 'The voting window for your department has closed.' : picked ? 'One person selected.' : 'Select one person to continue.'}
        </span>
        <button className="btn btn-gold" onClick={submit} disabled={!picked || busy || expired}>
          {busy ? 'Recording…' : expired ? 'Closed' : 'Submit my vote'}
        </button>
      </div>

      <p className="hint">
        Your vote is anonymous. It is stored as a count against the person you chose — no one, including
        HR, can see which ballot was yours.
      </p>
    </div>
  )
}
