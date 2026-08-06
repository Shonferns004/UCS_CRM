import { useState } from 'react'

async function parseJson(res) {
  const text = await res.text()
  return text ? JSON.parse(text) : {}
}

export default function Login({ apiUrl, onLogin }) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!identifier || !password) { setError('Enter your login ID and password.'); return }
    setBusy(true)
    setError('')
    try {
      const res = await fetch(apiUrl + '/auth/salary-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      })
      const data = await parseJson(res)
      if (!res.ok) throw new Error(data.message || 'Login failed')
      onLogin(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <span className="material-symbols-outlined">payments</span>
        </div>
        <h1>Salary Calculator</h1>
        <p className="sub">Accounts department &amp; super admin only.</p>
        <form onSubmit={submit}>
          <label htmlFor="login-id">Login ID / Email</label>
          <input id="login-id" type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoFocus />
          <label htmlFor="login-pass">Password</label>
          <input id="login-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          {error && <div className="msg err">{error}</div>}
          <button className="btn-primary login-btn" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Log In'}
          </button>
        </form>
      </div>
    </div>
  )
}
