import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchStatus, getDeviceToken, join, setDeviceToken, submitRating } from './api'
import { POLL_MS } from './config'
import NameEntry from './components/NameEntry'
import RatingForm from './components/RatingForm'
import RatedDone from './components/RatedDone'
import Waiting from './components/Waiting'

/**
 * Screen resolution from the server's answer.
 *
 * `already_rated` on the current speaker is the single source of truth for the
 * done screen. It is a per-device fact the server owns — the device token cannot
 * be forged by clearing storage into a different identity, and it survives a
 * reload — so there is no client-side memory of "did I already vote" to drift out
 * of step with the database.
 */
function screenFor(data, hasDevice) {
  if (!hasDevice) return 'name'
  if (!data?.live) return 'waiting'

  const current = data.current
  if (current?.already_rated) return 'done'
  if (current) return 'rating'
  return 'waiting'
}

export default function App() {
  // 'loading' until the first poll answers, so a returning rater is not asked
  // for their name again just because the reload beat the request.
  const [screen, setScreen] = useState(() => (getDeviceToken() ? 'loading' : 'name'))
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(!navigator.onLine)

  // Which speaker the confirmation should name. The server tells us the current
  // one is already rated but not who that was relative to the form just sent, so
  // this remembers the name at submit time for the gap between polls.
  const ratedRef = useRef(null)

  const poll = useCallback(async () => {
    try {
      const data = await fetchStatus()
      setOffline(false)
      setStatus(data)
      setScreen((prev) => {
        const next = screenFor(data, !!getDeviceToken())
        // Never yank somebody off the name field they are typing into.
        if (prev === 'name' || prev === 'loading') return next
        return next
      })
    } catch (e) {
      // A failed poll is not a failed rating: ratings are stored server-side, so
      // the form and its scores are deliberately left untouched. Flag the
      // connection and try again on the next tick.
      setOffline(true)
      setScreen((prev) => (prev === 'loading' ? 'waiting' : prev))
    }
  }, [])

  // Poll only once there is a device to poll for. Phones sitting on the name
  // screen have nothing to learn, and a full room of them polling would be
  // pointless load on the server.
  useEffect(() => {
    if (screen === 'name') return undefined
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [screen, poll])

  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const handleJoin = async (name) => {
    setBusy(true)
    setError('')
    try {
      const res = await join(name)
      if (res?.device_token) setDeviceToken(res.device_token)
      setScreen('loading')
      poll()
    } catch (e) {
      setError(e.message || 'Could not join. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const handleRate = async (payload) => {
    setBusy(true)
    setError('')
    try {
      await submitRating(payload)
      ratedRef.current = { id: payload.participantId, name: status?.current?.name || 'this speaker' }
      setScreen('done')
    } catch (e) {
      // Branch on the server's code, not the status: 409 covers "already rated"
      // (which is a success from here), "nobody on stage" and "the speaker
      // changed mid-form" (which are not).
      if (e.code === 'already_rated') {
        ratedRef.current = { id: payload.participantId, name: status?.current?.name || 'this speaker' }
        setScreen('done')
        poll()
      } else if (e.code === 'no_event' || e.code === 'no_speaker' || e.code === 'stale_speaker') {
        // The stage moved on without this phone. Say so, then let the next poll
        // bring up whoever is actually there now.
        setError(e.message)
        poll()
      } else if (e.code === 'not_joined') {
        setError('Your session expired. Reload the page and enter your name again.')
      } else {
        setError(e.status ? e.message : 'Could not save your rating. Check your connection and try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (screen === 'name') {
    return (
      <>
        <NameEntry onSubmit={handleJoin} busy={busy} error={error} />
        <Banner offline={offline} />
      </>
    )
  }

  if (screen === 'loading') {
    return (
      <main className="stage stage-centre">
        <div className="card wait-card">
          <span className="spinner" aria-hidden="true" />
          <p className="lede">Finding out who is on stage…</p>
        </div>
      </main>
    )
  }

  if (screen === 'rating' && status?.current) {
    return (
      <>
        {/* Keyed on the speaker so a change of speaker mid-rating resets the
            scores, rather than carrying them over to somebody else. */}
        <RatingForm
          key={status.current.id}
          participant={status.current}
          onSubmit={handleRate}
          busy={busy}
          error={error}
        />
        <Banner offline={offline} />
      </>
    )
  }

  if (screen === 'done') {
    return (
      <>
        <RatedDone
          participant={ratedRef.current || status?.current || { name: 'this speaker' }}
          nextUp={status?.next?.name}
          onCheckAgain={poll}
        />
        <Banner offline={offline} />
      </>
    )
  }

  return (
    <>
      <Waiting
        live={!!status?.live}
        voterCount={status?.event?.voter_count || 0}
        onRetry={poll}
      />
      <Banner offline={offline} />
    </>
  )
}

/** A persistent hint that the phone is offline, so a failed submit is explicable. */
function Banner({ offline }) {
  if (!offline) return null
  return (
    <div className="offline-bar" role="status" aria-live="polite">
      No connection. Keep this page open — it will catch up on its own.
    </div>
  )
}