import { useEffect, useState } from 'react'
import { fetchStatus, login } from '../api'

/**
 * Sign-in is only offered while a ceremony is actually running — the booth exists
 * for one event, so accepting passwords outside that window just produces
 * confusing "no ceremony" screens for people who wandered in from a stale link.
 */
export default function Login() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState(null)
  const [checking, setChecking] = useState(true)

  // Re-checked on an interval because HR often sets the ceremony up well before
  // people sit down, and a page left open should light up by itself.
  useEffect(() => {
    let alive = true
    const check = async () => {
      try {
        const s = await fetchStatus()
        if (alive) setStatus(s)
      } catch {
        if (alive) setStatus({ live: false, unreachable: true })
      } finally {
        if (alive) setChecking(false)
      }
    }
    check()
    const id = setInterval(check, 15000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const open = !!status?.live

  async function submit(e) {
    e.preventDefault()
    if (!identifier.trim() || !password) {
      setError('Enter your login ID and password')
      return
    }
    setBusy(true)
    setError('')
    try {
      // login() writes the session and signals the AuthProvider in this same
      // tab, so signing in flips the whole app to the ceremony view.
      await login(identifier.trim(), password)
    } catch (err) {
      setError(err.message || 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="mark">U</div>
        <div>
          <div className="title">Award Ceremony Voting</div>
          <div className="sub">Every vote is anonymous</div>
        </div>
      </div>

      <div className="body">
        <form className="card" onSubmit={submit}>
          <div className="eyebrow">{open ? 'Sign in to vote' : 'Not open yet'}</div>
          <h1 className="big">
            {open ? status.title || 'Your ballot is waiting' : 'The ceremony has not started'}
          </h1>

          {checking ? (
            <div className="spinner dark" />
          ) : open ? (
            <p className="lede">
              Use the same login ID and password you use for the UCS CRM. You will only be able to vote
              while your own department&rsquo;s turn is open.
            </p>
          ) : (
            <>
              <p className="lede">
                Voting opens when HR starts the award ceremony. Leave this page open — it will activate on
                its own — or come back when you are called.
              </p>
              {status?.unreachable && (
                <div className="alert alert-error">Could not reach the server. Check your connection.</div>
              )}
            </>
          )}

          {error && <div className="alert alert-error">{error}</div>}

          <fieldset
            disabled={!open}
            style={{ border: 0, padding: 0, margin: 0, opacity: open ? 1 : 0.45 }}
          >
            <label className="field">
              <span>Login ID</span>
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="firstname.surname@ufs"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>

            <button className="btn btn-gold btn-block" disabled={busy || !open}>
              {busy ? 'Signing in…' : open ? 'Sign in' : 'Waiting for HR to start'}
            </button>
          </fieldset>

          <p className="hint">
            We record only which person you voted for — never who cast the vote. One ballot per person,
            and it cannot be changed or undone.
          </p>
        </form>
      </div>
    </div>
  )
}
