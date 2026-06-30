import { useState, useEffect } from 'react'
import { getToken, getUser, clearSession, login as apiLogin } from './api'
import AttendanceView from './AttendanceView'

export default function App() {
  const [user, setUser] = useState(() => getUser())
  const [token, setToken] = useState(() => getToken())
  const [identifier, setIdentifier] = useState(import.meta.env.VITE_ADMIN_EMAIL || '')
  const [password, setPassword] = useState(import.meta.env.VITE_ADMIN_PASSWORD || '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setUser(getUser())
    setToken(getToken())
    const onExpired = () => { setToken(null); setUser(null) }
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [])

  if (token && user) {
    return (
      <div className="app">
        <header className="topbar">
          <div>
            <span className="eyebrow">Shon</span>
            <h2>Attendance View</h2>
          </div>
          <div className="topbar-user">
            <span className="topbar-name">{user.name || user.email || 'User'}</span>
            <span className="topbar-role">{user.role}</span>
            <button className="btn btn-sm" onClick={() => { clearSession(); setToken(null); setUser(null) }}>Sign out</button>
          </div>
        </header>
        <div className="content">
          <AttendanceView />
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h2>Attendance</h2>
        <p className="login-sub">Sign in to manage attendance</p>
        <form className="login-form" onSubmit={async (e) => {
          e.preventDefault()
          if (!identifier || !password) { setError('Please fill in all fields'); return }
          setLoading(true)
          setError('')
          try {
            const data = await apiLogin(identifier, password)
            setToken(data.token)
            setUser(data.user || data)
          } catch (err) {
            setError(err.message)
          } finally {
            setLoading(false)
          }
        }}>
          {error && <div className="login-error">{error}</div>}
          <label className="field">
            <span>Email / Login ID</span>
            <input type="text" value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="Enter email or login ID" />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" />
          </label>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
