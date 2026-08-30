import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ToastContainer, { toast } from './Toast'
import { useUcs } from './store'
import { login, setSession } from './api'
import SimCardPanel from './SimCardPanel'

function Login({ onSuccess }) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    if (!identifier || !password) { setError('Please fill in all fields'); return }
    setLoading(true)
    setError('')
    login(identifier.trim(), password.trim())
      .then(({ token, user }) => {
        setSession(token, user)
        onSuccess(user)
      })
      .catch(() => setError('Invalid credentials'))
      .finally(() => setLoading(false))
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h2>SIM Card Panel</h2>
        <p className="login-sub">Sign in to manage SIM cards</p>
        <form className="login-form" onSubmit={submit}>
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

export default function App() {
  const { user, setUser } = useUcs()

  if (!user) {
    return (
      <>
        <ToastContainer />
        <Login onSuccess={setUser} />
      </>
    )
  }

  return (
    <>
      <ToastContainer />
      <Routes>
        <Route path="/sim/*" element={<SimCardPanel />} />
        <Route path="*" element={<Navigate to="/sim/dashboard" replace />} />
      </Routes>
    </>
  )
}
