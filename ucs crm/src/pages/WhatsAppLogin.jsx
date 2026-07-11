import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login as apiLogin, setSession } from '../api/auth'

export default function WhatsAppLogin({ onBack, onSwitchToSignup }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    setError('')
    try {
      const data = await apiLogin(email, password)
      const userData = data.user || { ...data }
      userData.role = data.role
      setSession('ucs', data.token, userData)
      navigate('/wcrm', { replace: true })
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="wa-login">
      <div style={{
        width: 380,
        padding: 32,
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 4px 24px rgba(0,0,0,.08)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: '#25D36615', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="#25D366">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1f2937' }}>WhatsApp CRM</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Sign in to your WhatsApp CRM account</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: '100%', padding: '10px 12px', fontSize: 13,
                border: '1px solid #d1d5db', borderRadius: 8, boxSizing: 'border-box',
                outline: 'none', transition: 'border-color .15s',
              }}
              onFocus={e => e.target.style.borderColor = '#25D366'}
              onBlur={e => e.target.style.borderColor = '#d1d5db'}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%', padding: '10px 12px', fontSize: 13,
                border: '1px solid #d1d5db', borderRadius: 8, boxSizing: 'border-box',
                outline: 'none', transition: 'border-color .15s',
              }}
              onFocus={e => e.target.style.borderColor = '#25D366'}
              onBlur={e => e.target.style.borderColor = '#d1d5db'}
            />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 12, padding: '8px 10px', background: '#fef2f2', borderRadius: 6 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading || !email || !password}
            style={{
              width: '100%', padding: '11px', fontSize: 14, fontWeight: 600,
              background: loading ? '#d1d5db' : '#25D366',
              color: '#fff', border: 'none', borderRadius: 8,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background .15s',
            }}
            onMouseOver={e => { if (!loading) e.target.style.background = '#1da851' }}
            onMouseOut={e => { if (!loading) e.target.style.background = '#25D366' }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>Don't have an account? </span>
          <button onClick={onSwitchToSignup}
            style={{ border: 'none', background: 'transparent', color: '#25D366', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
            Sign up
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button onClick={onBack}
            style={{ border: 'none', background: 'transparent', color: '#9ca3af', fontSize: 11, cursor: 'pointer', padding: '2px 8px' }}>
            ← Back to CRM Login
          </button>
        </div>
      </div>
    </div>
  )
}
