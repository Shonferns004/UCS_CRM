import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useUcs } from '../store'


export default function Login({ onLogin }) {
  const { login } = useUcs()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sessionExpired, setSessionExpired] = useState(searchParams.get('expired') === '1')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  // Strip the ?expired=1 flag from the URL once we've shown the banner, so it
  // doesn't reappear on refresh or manual navigation.
  useEffect(() => {
    if (searchParams.get('expired') === '1') {
      const next = new URLSearchParams(searchParams)
      next.delete('expired')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      const data = await login(email, pass)
      onLogin?.(data.user || data)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">UCS</div>
        <h1 className="login-title">CRM Portal</h1>
        <p className="login-sub">Sign in to your account</p>
        {sessionExpired && (
          <div className="login-error" style={{ marginBottom: 12 }}>
            Your session expired. Please log in again.
          </div>
        )}
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="field">
            <label>Email / Login ID</label>
            <input type="text" value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter your email" required />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Enter your password" required />
          </div>
          {err && <div className="login-error">{err}</div>}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
