import { useEffect, useRef, useState } from 'react'
import { fetchCeremony, logout } from './api'
import { useAuth } from './store'
import { onVotingUpdate } from './socket'
import { introSeenFor, markIntroSeen } from './helpers'
import Login from './components/Login'
import CeremonyIntro from './components/CeremonyIntro'
import WaitingRoom from './components/WaitingRoom'
import Ballot from './components/Ballot'
import VoteSuccess from './components/VoteSuccess'
import Results from './components/Results'
import ToastContainer from './components/Toast'

// How often to re-check the turn state. Realtime normally pushes the change
// immediately; this is the floor that makes the app correct when the socket does
// not connect, which on venue wifi is often.
const POLL_MS = 5000

export default function App() {
  const { user, isAuthed, setSession } = useAuth()
  const [ceremony, setCeremony] = useState(null)
  const [loading, setLoading] = useState(isAuthed)
  const [error, setError] = useState('')
  const [intro, setIntro] = useState(null)

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
  const department = ceremony?.department
  const turn = ceremony?.turn

  // The intro plays when the ceremony opens and again when this person's turn
  // opens. Keyed on the turn (falling back to the session) and remembered, so a
  // refresh mid-vote does not throw someone back to the ceremony. `introSeenFor`
  // is per-key, so a later department's turn still gets its own intro.
  const introKey =
    state === 'voting' && turn?.id ? `turn-${turn.id}` : session?.id ? `session-${session.id}` : null

  useEffect(() => {
    if (!session || session.status !== 'live' || !introKey) return
    if (intro) return
    if (introSeenFor(introKey)) return
    setIntro({ key: introKey, session, department })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introKey, session?.status])

  function closeIntro() {
    if (intro) markIntroSeen(intro.key)
    setIntro(null)
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
            <div className="dept">{department?.name || user?.department || '—'}</div>
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
          ) : state === 'voted' ? (
            <VoteSuccess ceremony={ceremony} />
          ) : state === 'voting' ? (
            <Ballot onVoted={refresh} />
          ) : (
            <WaitingRoom ceremony={ceremony} state={state} />
          )}
        </div>
      </div>

      {intro && <CeremonyIntro session={intro.session} department={intro.department} onDone={closeIntro} />}
    </>
  )
}
