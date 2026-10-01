import { useEffect, useId, useState } from 'react'
import { fetchStatus, login } from '../api'
import { ArrowRight } from '../icons'
import trophyUrl from '../assets/images/transparent.png'

/* The artwork is 1536x1024 with roughly 12% transparent margin on each side, so
   the box must be wider than the trophy looks for the visible cup to land on the
   reference's 250-280px. Width and height are set so the browser reserves the
   correct box before the 1.7 MB PNG decodes. */
const TROPHY_BOX = 350
const TROPHY_ASPECT = 1536 / 1024

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
    <main className="signin-stage">
      <form className="signin-card" onSubmit={onSubmit}>
        <div className="signin-trophy">
          <img
            src={trophyUrl}
            alt=""
            width={TROPHY_BOX}
            height={Math.round(TROPHY_BOX / TROPHY_ASPECT)}
            style={{ aspectRatio: TROPHY_ASPECT }}
            fetchPriority="high"
            decoding="async"
            draggable="false"
          />
        </div>

        <div className="signin-head">
          <h1 className="signin-title">
            {open ? (
              <>
                <span className="signin-title-line">Monthly Award</span>
                <span className="signin-title-line">
                  <span className="signin-title-gold">Ceremony</span>
                </span>
              </>
            ) : (
              <span className="signin-title-line">The ceremony has not started</span>
            )}
          </h1>
        </div>

        {checking ? (
          <div className="spinner dark signin-spinner" />
        ) : (
          <>
            {!open && (
              // Marked optional so a short viewport can drop it and keep the
              // form itself on screen.
              <p className="signin-lede is-optional">
                Voting opens when HR starts the award ceremony. Leave this page open — it will activate on
                its own — or come back when you are called.
              </p>
            )}
            {!open && unreachable && (
              <div className="signin-note" role="status">
                Could not reach the server. Check your connection.
              </div>
            )}
          </>
        )}

        {error && (
          <div className="signin-error" id={errorId} role="alert">
            {error}
          </div>
        )}

        <fieldset className="signin-fieldset" disabled={!open}>
          <div className="signin-field">
            <label className="signin-label" htmlFor={idId}>
              Login ID
            </label>
            <input
              id={idId}
              className="signin-input"
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

          <div className="signin-field">
            <label className="signin-label" htmlFor={pwId}>
              Password
            </label>
            <input
              id={pwId}
              className="signin-input"
              type="password"
              value={password}
              onChange={(e) => onPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              aria-describedby={error ? errorId : undefined}
            />
          </div>

          <button className="signin-submit" disabled={busy || !open}>
            {busy ? 'Signing in…' : open ? 'Sign in' : 'Waiting for HR to start'}
            {!busy && open ? <ArrowRight size={18} aria-hidden="true" focusable="false" /> : null}
          </button>
        </fieldset>
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
    // The signed-out page carries no header bar and no brand mark: the trophy
    // artwork is the only thing on the page that identifies the ceremony.
    <div className="signin">
      <div className="signin-bg" aria-hidden="true" />

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
