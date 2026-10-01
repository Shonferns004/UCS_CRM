import { useEffect, useMemo, useRef, useState } from 'react'
import { castVote, fetchBallot } from '../api'
import { departmentAccent, formatCountdown, groupByTeam, initials, secondsUntil } from '../helpers'
import { ArrowLeft, ArrowRight, Check, DepartmentIcon } from '../icons'
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
 * The teams on a ballot, from whichever shape the payload arrived in.
 *
 * The server groups them so the ballot, the submission check and the winners all
 * agree on what a team is. A flat nominee list is still accepted — the grouping
 * here mirrors the server's — so the panel renders from either.
 */
function teamsOf(data) {
  if (Array.isArray(data?.teams) && data.teams.length > 0) return data.teams
  return groupByTeam(data?.nominees, { fallbackLabel: data?.department?.name })
}

/**
 * The one team whose grid is open, and how many teams are already locked in.
 *
 * Teams are revealed one at a time: the next team only appears once this one has
 * a pick, so a five-team department asks one question at a time instead of
 * presenting five grids to scroll through and keep straight. Derived entirely from
 * `picks`, so going back and changing a pick reopens the right team with no
 * separate step index to fall out of sync.
 */
const activeTeamIndex = (teams, picks) => {
  const next = teams.findIndex((t) => !picks[t.key]);
  return next === -1 ? teams.length - 1 : next;
};

/** How many teams have a pick, and how many still need one. */
const pickProgress = (teams, picks) => {
  const chosen = teams.filter((t) => picks[t.key]).length
  return { chosen, total: teams.length, complete: teams.length > 0 && chosen === teams.length }
}

/**
 * Arrow keys move between candidates inside one team's grid, so each team is
 * usable without a mouse and focus never wanders into another team's picks.
 */
function onGridKeyDown(e) {
  const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']
  if (!keys.includes(e.key)) return
  const grid = e.currentTarget
  const nodes = Array.from(grid.querySelectorAll('.cand'))
  const i = nodes.indexOf(document.activeElement)
  if (i < 0) return

  const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length)
  const col = i % cols
  // Left/right stay inside the row; up/down jump a whole row, so a key press can
  // never silently skip to another team.
  const next =
    e.key === 'ArrowRight'
      ? col + 1 < cols
        ? i + 1
        : i
      : e.key === 'ArrowLeft'
        ? col > 0
          ? i - 1
          : i
        : e.key === 'ArrowDown'
          ? i + cols < nodes.length
            ? i + cols
            : i
          : i - cols >= 0
            ? i - cols
            : i

  if (next === i) return
  e.preventDefault()
  nodes[next]?.focus()
}

/**
 * The presentational ballot: everything the voter sees, driven purely by props.
 *
 * Split out from the data-fetching wrapper so the candidate grid - team sections,
 * circular portraits, names below, selection states - can be rendered and checked
 * on its own, without a live server behind it.
 *
 * The pick is per team: one person from every team on this department's ballot,
 * and the submit only unlocks once every team has one.
 */
export function BallotPanel({
  department,
  data,
  picks,
  onPick,
  onBack,
  busy,
  expired,
  error,
  left,
  onGroupKeyDown = onGridKeyDown,
}) {
  const accent = useMemo(() => departmentAccent(department), [department])
  const teams = useMemo(() => teamsOf(data), [data])
  const nominees = data?.nominees || []
  const progress = pickProgress(teams, picks)
  // Everything before this index has a pick and is collapsed; this one is open.
  const openIndex = activeTeamIndex(teams, picks)
  // A team that has been voted for is never shown again, so this only has to cover
  // the open team's own tile. The seed value 'recorded' comes from the server and
  // deliberately matches no nominee id, so a resumed pick never highlights anyone.
  const pickedName = (team) => {
    const id = picks[team.key]
    return team.nominees.find((n) => n.id === id)?.name || ''
  }

  // Tapping a tile only proposes a pick: the dialog asks before it is recorded,
  // so a mis-tap on a crowded grid can be undone before it becomes a vote.
  const [proposed, setProposed] = useState(null)
  // One pick is one vote, so the confirmation writes it immediately. There is no
  // submit step to batch teams together, and no way back once it is written.
  const propose = (teamKey, nominee) => setProposed({ teamKey, nominee })
  const confirmPick = () => {
    if (!proposed) return
    onPick(proposed.teamKey, proposed.nominee.id)
    setProposed(null)
  }

  // Escape cancels. Listens on the document so it works without the backdrop
  // itself holding focus.
  useEffect(() => {
    if (!proposed) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setProposed(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [proposed])

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
        {teams.length === 1
          ? `Choose one person from the ${teams[0].label} team in ${department.name} — that team gets its own winner.`
          : `Choose one person for each of the ${teams.length} teams in ${department.name} — every team gets its own winner.`}{' '}
        You will be shown one team at a time.
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
{/* Only the open team is rendered at all. Teams already picked are not
              collapsed summaries - they are gone from the page, so the next team
              does not appear alongside the last one's names. */}
          <div className="team-ballot">
            {(() => {
              const team = teams[openIndex]
              if (!team) return null
              const ti = openIndex
              const pick = picks[team.key]
              return (
                  <section
                    key={team.key || 'no-team'}
                    className={`team-group is-open${pick ? ' is-done' : ''}`}
                    aria-labelledby={`team-${team.key || 'no-team'}-${ti}`}
                  >
                    <header className="team-head">
                      <span className="team-head-main">
                        <span className="team-name" id={`team-${team.key || 'no-team'}-${ti}`}>
                          {team.label}
                        </span>
                        <span className="team-size">
                          {team.nominees.length}{' '}
                          {team.nominees.length === 1 ? 'person' : 'people'}
                        </span>
                      </span>
                      {pick ? (
                        <span className="team-pick" role="status">
                          <Check size={14} aria-hidden="true" focusable="false" />
                          {pickedName(team)}
                        </span>
                      ) : (
                        <span className="team-pick is-empty">Pick one</span>
                      )}
                    </header>

                  <div
                    className="cand-grid"
                    role="radiogroup"
                    aria-label={`Choose one person from the ${team.label} team`}
                    onKeyDown={onGroupKeyDown}
                  >
                        {team.nominees.map((n, i) => {
                          const on = pick === n.id
                          return (
                            <button
                              key={n.id}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              // Roving tabindex: the selected tile (or the first, when
                              // nothing is picked) is the only one Tab stops on.
                              tabIndex={on || (!pick && i === 0) ? 0 : -1}
                              className={`cand${on ? ' is-selected' : ''}`}
                              style={{
                                '--dept-base': accent.base,
                                '--dept-soft': accent.soft,
                                '--dept-edge': accent.edge,
                              }}
                              onClick={() => propose(team.key, n)}
                              disabled={expired}
                            >
                              <span className="cand-portrait-wrap">
                                <Portrait nominee={n} accent={accent} />
                                <span className="cand-radio" aria-hidden="true" />
                              </span>
                              <span className="cand-name">{n.name}</span>
</button>
                          )
                        })}
                  </div>
                </section>
              )
            })()}
          </div>

{/* No submit button: choosing someone and confirming *is* the vote, and it
              cannot be taken back. The counter is the only progress shown, so no
              team name or choice appears anywhere once it is recorded. */}
          <div className="submit-bar">
            <span className="submit-bar-note" role="status">
              {expired
                ? 'Voting has closed.'
                : busy
                  ? 'Recording your vote…'
                  : `Team ${openIndex + 1} of ${progress.total}`}
            </span>
          </div>

          <p className="hint hint-center">
            Your vote is anonymous — no one, including HR, can see which ballot was yours.
          </p>
        </>
      )}

      {proposed ? (
        /* The pick is not recorded until this is answered, so cancelling leaves
           the team exactly as it was. Escape and the backdrop both cancel. */
        <div
          className="confirm-backdrop"
          onClick={() => setProposed(null)}
        >
          <div
            className="confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="confirm-title" id="confirm-title">
              Do you want to vote for {proposed.nominee.name}?
            </h2>
            <p className="confirm-note">
              Their team gets this vote as their winner.
            </p>
            <div className="confirm-actions">
              <button type="button" className="btn" onClick={() => setProposed(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-gold"
                onClick={confirmPick}
                autoFocus
              >
                Yes, vote for {proposed.nominee.name}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

/** Pick one person on each team's part of one department's ballot. */
export default function Ballot({ department, onDone, onBack, onSubmitted, onPicked }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  // One nominee per team, keyed by team key rather than held as a single id.
  const [picks, setPicks] = useState({})
  const [busy, setBusy] = useState(false)
  const [left, setLeft] = useState(0)

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
  // the vote anyway; locking the tiles early is a clearer message.
  const expired = !!data?.turn?.closes_at && left <= 0

  const teams = useMemo(() => teamsOf(data), [data])

  // Seed from the server's record so a reopened ballot resumes: a team already
  // voted for stays locked, and the next unvoted team is the one on screen.
  const seeded = useRef(false)
  useEffect(() => {
    if (!data || seeded.current) return
    seeded.current = true
    const done = Array.isArray(data.voted_team_keys) ? data.voted_team_keys : []
    if (done.length) setPicks(Object.fromEntries(done.map((k) => [k, 'recorded'])))
  }, [data])

  // Once every team has a recorded pick there is nothing left to vote in this
  // department, so hand control back to the ceremony grid.
  const complete = teams.length > 0 && teams.every((t) => picks[t.key])
  useEffect(() => {
    if (complete && !busy) onSubmitted?.(department)
  }, [complete, busy]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Record one team's vote the moment it is confirmed.
   *
   * Each pick is sent on its own, because a pick *is* the vote now - there is no
   * final submit to batch teams up. The server still records a team only once, so
   * a double tap or a second tab is rejected rather than counted twice.
   */
  async function recordPick(teamKey, nomineeId) {
    if (busy || expired) return
    setBusy(true)
    setError('')
    // Shown immediately so the next team feels like it advanced, while the
    // request is still in flight.
    setPicks((p) => ({ ...p, [teamKey]: nomineeId }))
    try {
      await castVote(department.id, [nomineeId])
      await onPicked?.()
    } catch (e) {
      // Roll the tile back: the pick was not accepted, so it must not look
      // recorded. The server keeps the real state and the next poll replaces it.
      setPicks((p) => {
        const next = { ...p }
        delete next[teamKey]
        return next
      })
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
      picks={picks}
      onPick={recordPick}
      onBack={onBack}
      busy={busy}
      expired={expired}
      error={error}
      left={left}
    />
  )
}