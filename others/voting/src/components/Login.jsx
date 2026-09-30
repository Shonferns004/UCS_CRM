import { useEffect, useId, useState } from 'react'
import { fetchStatus, login } from '../api'
import AppHeader from './AppHeader'

/**
 * The sign-in card, driven purely by props. Split out from the wrapper that
 * polls the status endpoint, so both the open and the "not open yet" branches
 * can be rendered and checked without a server behind them.
 */
export function LoginCard({
  open,
  checking,
  unreachable,
  busy,
  error,
  identifier,
  password,
  onIdentifier,
  onPassword,
  onSubmit,
  idId,
  pwId,
  errorId,
}) {
  return (
    <main className="shell-main">
      <form className="panel panel-narrow" onSubmit={onSubmit}>
        <div className="panel-center">
          <span className="eyebrow">{open ? 'Sign in to vote' : 'Not open yet'}</span>
          <h1 className="panel-title">
            {open ? 'Monthly Award Ceremony' : 'The ceremony has not started'}
          </h1>
        </div>

        {checking ? (
          <div className="spinner dark" />
        ) : open ? (
          <p className="lede">
            Use the same login ID and password you use for the UCS CRM. You will be able to vote in every
            department while voting is open.
          </p>
        ) : (
          <>
            <p className="lede">
              Voting opens when HR starts the award ceremony. Leave this page open — it will activate on its
              own — or come back when you are called.
            </p>
            {unreachable && (
              <div className="alert alert-error">Could not reach the server. Check your connection.</div>
            )}
          </>
        )}

        {error && (
          <div className="alert alert-error" id={errorId} role="alert">
            {error}
          </div>
        )}

        <fieldset className="fieldset" disabled={!open}>
          <div className="field">
            <label className="field-label" htmlFor={idId}>
              Login ID
            </label>
            <input
              id={idId}
              className="field-input"
              value={identifier}
              onChange={(e) => onIdentifier(e.target.value)}
              placeholder="firstname.surname@ufs"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby={error ? errorId : undefined}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor={pwId}>
              Password
            </label>
            <input
              id={pwId}
              className="field-input"
              type="password"
              value={password}
              onChange={(e) => onPassword(e.target.value)}
              autoComplete="current-password"
              aria-describedby={error ? errorId : undefined}
            />
          </div>

          <button className="btn btn-gold btn-block btn-tall" disabled={busy || !open}>
            {busy ? 'Signing in…' : open ? 'Sign in' : 'Waiting for HR to start'}
          </button>
        </fieldset>

        <p className="hint hint-privacy">
          We record only which person you voted for — never who cast the vote. One ballot per person, and it
          cannot be changed or undone.
        </p>
      </form>
    </main>
  )
}

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
  const idId = useId()
  const pwId = useId()
  const errorId = useId()

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
    <div className="shell">
      <AppHeader />
      <LoginCard
        open={open}
        checking={checking}
        unreachable={!!status?.unreachable}
        busy={busy}
        error={error}
        identifier={identifier}
        password={password}
        onIdentifier={setIdentifier}
        onPassword={setPassword}
        onSubmit={submit}
        idId={idId}
        pwId={pwId}
        errorId={errorId}
      />
    </div>
  )
}
