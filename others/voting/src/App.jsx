import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchCeremony, logout } from './api'
import { useAuth } from './store'
import { onVotingUpdate } from './socket'
import {
  allDepartmentsVoted,
  introSeenFor,
  markIntroSeen,
  nextDepartment,
  withDepartmentVoted,
} from './helpers'
import AppHeader from './components/AppHeader'
import Login from './components/Login'
import CeremonyIntro from './components/CeremonyIntro'
import WaitingRoom from './components/WaitingRoom'
import DepartmentGrid from './components/DepartmentGrid'
import Ballot from './components/Ballot'
import VoteSubmitted from './components/VoteSubmitted'
import AllComplete from './components/AllComplete'
import Results from './components/Results'
import ToastContainer from './components/Toast'

// How often to re-check the ceremony state. Realtime normally pushes the change
// immediately; this is the floor that makes the app correct when the socket does
// not connect, which on venue wifi is often.
const POLL_MS = 5000

export default function App() {
  const { user, isAuthed, setSession } = useAuth()
  const [ceremony, setCeremony] = useState(null)
  const [loading, setLoading] = useState(isAuthed)
  const [error, setError] = useState('')
  const [intro, setIntro] = useState(null)
  // Which department's ballot is open, if any. null means the grid is showing.
  const [activeDept, setActiveDept] = useState(null)
  // Set briefly after a vote lands, to show the confirmation screen instead of
  // jumping straight to the next ballot. Holds the department just voted in so
  // the confirmation can name it.
  const [justVoted, setJustVoted] = useState(null)

  // Kept in a ref so the poll and the socket handler always call the latest
  // version without re-subscribing on every render.
  const inFlight = useRef(false)

  async function refresh() {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const data = await fetchCeremony()
      setCeremony(data)
      setError('')
    } catch (e) {
      // A 401 means the CRM token expired while this tab sat open. Drop the
      // session so the login screen appears instead of an error loop.
      if (e.status === 401) {
        logout()
        setSession(null)
      } else {
        setError(e.message || 'Could not reach the ceremony')
      }
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAuthed) {
      setLoading(false)
      return undefined
    }
    setLoading(true)
    refresh()
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed])

  useEffect(() => {
    if (!isAuthed) return undefined
    // Any push from the server — a turn opening, closing, or a vote landing —
    // just means "re-read the truth". The payload carries no ballot detail, so
    // there is nothing to apply from it.
    return onVotingUpdate(() => refresh())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed])

  const state = ceremony?.state
  const session = ceremony?.session
  const departments = ceremony?.departments || []

  // The intro plays once, when the ceremony opens. There is no per-department
  // turn any more, so there is nothing to replay it for.
  const introKey = session?.id ? `session-${session.id}` : null

  useEffect(() => {
    if (!session || session.status !== 'live' || !introKey) return
    if (intro) return
    if (introSeenFor(introKey)) return
    setIntro({ key: introKey, session, department: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introKey, session?.status])

  function closeIntro() {
    if (intro) markIntroSeen(intro.key)
    setIntro(null)
  }

  function signOut() {
    logout()
    setSession(null)
  }

  // Clicking a department opens its ballot.
  function openBallot(dept) {
    setJustVoted(null)
    setActiveDept(dept)
  }

  // One team was voted in. Deliberately does NOT close the ballot: there are
  // more teams to do, and the ballot screen has already moved to the next one.
  // Reassigning `voted` here would mark the whole department done after a single
  // pick and the grid would offer it as finished.
  async function onTeamPicked() {
    // Nothing to do locally — the ballot is the source of truth mid-department.
  }

  // A vote landed. Mark it locally the moment it succeeds, so the confirmation
  // screen and its "next department" choice are correct even if the catch-up
  // refresh is slow or fails; the next poll replaces this with server truth.
  async function onVoteSubmitted(dept) {
    setCeremony((c) => withDepartmentVoted(c, dept.id))
    setJustVoted({ department: dept })
    setActiveDept(null)
    await refresh()
  }

  // Leaving a ballot without voting, or after the server rejected the submit
  // (409 - already voted here, or voting closed). Both mean this screen is
  // finished, so the department must be closed as well as refreshed; otherwise
  // a rejected vote strands the voter on a ballot they can no longer use.
  function closeBallot() {
    setActiveDept(null)
    return refresh()
  }

  // By the time this is reachable, the department just voted for is already
  // marked voted in state.
  const nextDept = useMemo(() => nextDepartment(departments), [departments])

  const allVoted = allDepartmentsVoted(departments)

  if (!isAuthed) {
    return (
      <>
        <ToastContainer />
        <Login />
      </>
    )
  }

  return (
    <>
      <ToastContainer />
      <div className="shell">
        <AppHeader user={user} onSignOut={signOut} />

        <main className="shell-main">
          {loading ? (
            <div className="panel">
              <div className="spinner dark" />
            </div>
          ) : error && !ceremony ? (
            <div className="panel">
              <div className="alert alert-error" role="alert">
                {error}
              </div>
              <button className="btn" onClick={refresh}>
                Try again
              </button>
            </div>
          ) : state === 'results' ? (
            <Results ceremony={ceremony} />
          ) : state === 'voting' ? (
            activeDept ? (
              <Ballot
                key={activeDept.id}
                department={activeDept}
                onDone={closeBallot}
                onBack={() => setActiveDept(null)}
                onSubmitted={onVoteSubmitted}
                onPicked={onTeamPicked}
              />
            ) : justVoted ? (
              <VoteSubmitted
                ceremony={ceremony}
                lastDepartment={justVoted.department}
                nextDepartment={allVoted ? null : nextDept}
                onNext={openBallot}
              />
            ) : allVoted ? (
              <AllComplete ceremony={ceremony} />
            ) : (
              <DepartmentGrid ceremony={ceremony} onVote={openBallot} />
            )
          ) : (
            <WaitingRoom ceremony={ceremony} state={state} />
          )}
        </main>
      </div>

      {intro && <CeremonyIntro session={intro.session} department={intro.department} onDone={closeIntro} />}
    </>
  )
}
