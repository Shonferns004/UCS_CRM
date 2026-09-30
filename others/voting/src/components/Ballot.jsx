import { useEffect, useMemo, useRef, useState } from 'react'
import { castVote, fetchBallot } from '../api'
import { departmentAccent, formatCountdown, initials, secondsUntil } from '../helpers'
import { ArrowLeft, ArrowRight, DepartmentIcon } from '../icons'
import { toast } from './Toast'

/** Circular portrait, with a neutral initial fallback when there is no photo. */
function Portrait({ nominee, accent }) {
  const [failed, setFailed] = useState(false)
  const showImage = nominee.photo_url && !failed

  return (
    <span className="portrait" style={{ '--dept-base': accent.base, '--dept-soft': accent.soft }}>
      {showImage ? (
        <img
          src={nominee.photo_url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        /* No photo, or one that failed to load: initials, not a broken icon. */
        <span className="portrait-fallback" aria-hidden="true">
          {initials(nominee.name)}
        </span>
      )}
    </span>
  )
}

/**
 * The presentational ballot: everything the voter sees, driven purely by props.
 *
 * Split out from the data-fetching wrapper so the candidate grid - circular
 * portraits, names below, selection states - can be rendered and checked on its
 * own, without a live server behind it.
 */
export function BallotPanel({
  department,
  data,
  picked,
  onPick,
  onBack,
  onSubmit,
  busy,
  expired,
  error,
  left,
  gridRef,
  onGridKeyDown,
}) {
  const accent = useMemo(() => departmentAccent(department), [department])
  const nominees = data?.nominees || []

  if (error && !data) {
    return (
      <section className="panel">
        <div className="alert alert-error" role="alert">
          {error}
        </div>
        <button className="btn" onClick={onBack}>
          Back
        </button>
      </section>
    )
  }

  if (!data) {
    return (
      <section className="panel">
        <div className="spinner dark" />
      </section>
    )
  }

  return (
    <section className="panel">
      <button type="button" className="back-link" onClick={onBack}>
        <ArrowLeft size={15} aria-hidden="true" focusable="false" />
        Back to Departments
      </button>

      <div className="ballot-head">
        <div className="ballot-head-main">
          <span
            className="dept-card-icon"
            style={{ '--dept-base': accent.base, '--dept-soft': accent.soft }}
          >
            <DepartmentIcon name={department.name} size={22} aria-hidden="true" focusable="false" />
          </span>
          <div className="ballot-head-text">
            <span className="eyebrow">{data.session?.award_label || 'Star of the Department'}</span>
            <h1 className="panel-title">{department.name}</h1>
          </div>
        </div>

        <div className="ballot-clock">
          <span className="ballot-clock-label">Voting closes in</span>
          <span className={`ballot-clock-timer${expired ? ' is-over' : ''}`}>
            {expired ? 'Closed' : formatCountdown(left)}
          </span>
        </div>
      </div>

      <p className="lede">
        Choose the one person from {department.name} you want to recognise. You can select only one, and
        your vote cannot be changed afterwards.
      </p>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {nominees.length === 0 ? (
        <div className="alert alert-warn">
          There is nobody on the {department.name} ballot right now. Please tell HR.
        </div>
      ) : (
        <>
          <div
            className="cand-grid"
            ref={gridRef}
            role="radiogroup"
            aria-label={`Choose one person from ${department.name}`}
            onKeyDown={onGridKeyDown}
          >
            {nominees.map((n, i) => {
              const on = picked === n.id
              return (
                <button
                  key={n.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  // Roving tabindex: the selected tile (or the first, when
                  // nothing is picked) is the only one Tab stops on.
                  tabIndex={on || (!picked && i === 0) ? 0 : -1}
                  className={`cand${on ? ' is-selected' : ''}`}
                  style={{ '--dept-base': accent.base, '--dept-soft': accent.soft, '--dept-edge': accent.edge }}
                  onClick={() => onPick(n.id)}
                  disabled={expired}
                >
                  <span className="cand-portrait-wrap">
                    <Portrait nominee={n} accent={accent} />
                    <span className="cand-radio" aria-hidden="true" />
                  </span>
                  <span className="cand-name">{n.name}</span>
                  {n.employee_id || n.team || n.department ? (
                    <span className="cand-meta">
                      {n.employee_id ? <span className="cand-id">{n.employee_id}</span> : null}
                      {n.team || n.department ? (
                        <span className="cand-team">{n.team || n.department}</span>
                      ) : null}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>

          <div className="submit-bar">
            <span className="submit-bar-note" role="status">
              {expired ? 'Voting has closed.' : picked ? '1 person selected.' : 'No person selected.'}
            </span>
            <button className="btn btn-gold btn-tall" onClick={onSubmit} disabled={!picked || busy || expired}>
              {busy ? 'Recording…' : expired ? 'Closed' : 'Submit my vote'}
              {!busy && !expired ? <ArrowRight size={16} aria-hidden="true" focusable="false" /> : null}
            </button>
          </div>

          <p className="hint hint-center">
            Your vote is anonymous — no one, including HR, can see which ballot was yours.
          </p>
        </>
      )}
    </section>
  )
}

/** Pick exactly one person on one department's ballot. */
export default function Ballot({ department, onDone, onBack, onSubmitted }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState(null)
  const [busy, setBusy] = useState(false)
  const [left, setLeft] = useState(0)
  const gridRef = useRef(null)

  useEffect(() => {
    let alive = true
    fetchBallot(department.id)
      .then((d) => {
        if (!alive) return
        setData(d)
        setLeft(secondsUntil(d.turn?.closes_at))
      })
      .catch((e) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [department.id])

  useEffect(() => {
    if (!data?.turn?.closes_at) return undefined
    setLeft(secondsUntil(data.turn.closes_at))
    const id = setInterval(() => setLeft(secondsUntil(data.turn.closes_at)), 1000)
    return () => clearInterval(id)
  }, [data?.turn?.closes_at])

  // The window can run out while this screen is open. The server would reject
  // the submit anyway; stopping the button early is a clearer message.
  const expired = !!data?.turn?.closes_at && left <= 0

  // Arrow keys move between candidates, so the grid is usable without a mouse.
  function onGridKeyDown(e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    if (!data?.nominees?.length) return
    const nodes = Array.from(gridRef.current?.querySelectorAll('.cand') || [])
    const i = nodes.indexOf(document.activeElement)
    if (i < 0) return
    e.preventDefault()
    const next = nodes[i + (e.key === 'ArrowRight' ? 1 : -1)]
    next?.focus()
  }

  async function submit() {
    if (!picked || busy) return
    setBusy(true)
    setError('')
    try {
      await castVote(department.id, picked)
      toast('Vote recorded', 'success')
      // The server deliberately does not echo the nominee back, so nothing on
      // the confirmation screen can reveal the choice. onSubmitted closes this
      // screen and refreshes, so there is nothing left to do here.
      await onSubmitted?.(department)
    } catch (e) {
      setError(e.message)
      // 409 is either "already voted here" or "voting closed" - in both cases
      // this screen is finished and the parent needs to re-check the real state.
      if (e.status === 409) onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <BallotPanel
      department={department}
      data={data}
      picked={picked}
      onPick={setPicked}
      onBack={onBack}
      onSubmit={submit}
      busy={busy}
      expired={expired}
      error={error}
      left={left}
      gridRef={gridRef}
      onGridKeyDown={onGridKeyDown}
    />
  )
}
