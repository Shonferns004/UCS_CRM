import { useState, useEffect } from 'react'
import { getUser, clearSession, setSession, login } from './api'
import AttendanceView from './AttendanceView'

export default function App() {
  const [saved, setSaved] = useState(() => getUser())
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => { setInstallPrompt(null); setInstalled(true) })
    if (window.matchMedia('(display-mode: standalone)').matches) setInstalled(true)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = () => {
    if (!installPrompt) return
    installPrompt.prompt()
    installPrompt.userChoice.then(({ outcome }) => { if (outcome === 'accepted') setInstalled(true); setInstallPrompt(null) })
  }

  if (saved) {
    return (
      <div className="app">
        <header className="topbar">
          <div>
            <h2>Employees</h2>
          </div>
          <div className="topbar-user">
            {installPrompt && <button className="btn btn-sm btn-install" onClick={handleInstall}>Install App</button>}
            <span className="topbar-name">{saved.email}</span>
            <button className="btn btn-sm" onClick={() => { clearSession(); setSaved(null) }}>Sign out</button>
          </div>
        </header>
        <div className="content">
          <AttendanceView readOnly={saved.readOnly} />
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h2>Attendance</h2>
        <p className="login-sub">Sign in to view attendance</p>
        <form className="login-form" onSubmit={(e) => {
          e.preventDefault()
          if (!identifier || !password) { setError('Please fill in all fields'); return }
          setLoading(true)
          setError('')
          login(identifier.trim(), password.trim())
            .then(({ token, email, readOnly }) => {
              setSession(token, email, readOnly)
              setSaved({ email, readOnly })
            })
            .catch(() => setError('Invalid credentials'))
            .finally(() => setLoading(false))
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
        {installPrompt && (
          <button className="btn btn-install btn-install-wide" onClick={handleInstall}>
            Install App
          </button>
        )}
      </div>
    </div>
  )
}
