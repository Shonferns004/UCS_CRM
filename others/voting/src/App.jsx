import { useEffect, useRef, useState } from 'react'
import { fetchCeremony, logout } from './api'
import { useAuth } from './store'
import { onVotingUpdate } from './socket'
import { introSeenFor, markIntroSeen } from './helpers'
import Login from './components/Login'
import CeremonyIntro from './components/CeremonyIntro'
import WaitingRoom from './components/WaitingRoom'
import DepartmentGrid from './components/DepartmentGrid'
import Ballot from './components/Ballot'
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

  // Clicking a department opens its ballot. Voting in one drops the voter
  // straight into the next department they have not voted in yet, so the whole
  // ceremony is tap, pick, submit, repeat.
  function openBallot(dept) {
    setActiveDept(dept)
  }

  function advanceAfterVote() {
    const next = (ceremony?.departments || []).find((d) => !d.voted && d.open)
    setActiveDept(next || null)
  }

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
      <div className="app">
        <div className="topbar">
          <div className="mark">U</div>
          <div>
            <div className="title">Award Ceremony Voting</div>
            <div className="sub">Votes are anonymous</div>
          </div>
          <div className="spacer" />
          <div className="who">
            <div>{user?.name || user?.login_id}</div>
            <div className="dept">{user?.department || '—'}</div>
          </div>
          <button
            className="linkish"
            onClick={() => {
              logout()
              setSession(null)
            }}
          >
            Sign out
          </button>
        </div>

        <div className="body">
          {loading ? (
            <div className="card">
              <div className="spinner dark" />
            </div>
          ) : error && !ceremony ? (
            <div className="card">
              <div className="alert alert-error">{error}</div>
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
                onDone={advanceAfterVote}
                onBack={() => setActiveDept(null)}
              />
            ) : (
              <DepartmentGrid ceremony={ceremony} onVote={openBallot} />
            )
          ) : (
            <WaitingRoom ceremony={ceremony} state={state} />
          )}
        </div>
      </div>

      {intro && <CeremonyIntro session={intro.session} department={intro.department} onDone={closeIntro} />}
    </>
  )
}
