import React, { createContext, useState, useCallback, useEffect } from 'react'
import { getMe } from '../services/auth.service.js'

export const AuthContext = createContext(null)

// Metropad runs inside the Accounts panel. It deliberately has NO separate
// login: the accounts-panel session token (ucs_token) is reused, and the
// backend maps the signed-in accounts email onto the metropad user.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [tokenReady, setTokenReady] = useState(false)
  const [sessionError, setSessionError] = useState(null)

  useEffect(() => {
    const stored = localStorage.getItem('ucs_token')
    if (stored) {
      setToken(stored)
      getMe()
        .then((u) => setUser(u))
        .catch((err) => {
          localStorage.removeItem('ucs_token')
          setUser(null)
          setSessionError(err?.message || 'Missing Metropad access for this account')
        })
        .finally(() => setTokenReady(true))
    } else {
      setTokenReady(true)
    }
  }, [])

  // No-op placeholder to keep the shared interface stable.
  const login = useCallback(async () => null, [])

  const logout = useCallback(() => {
    localStorage.removeItem('ucs_token')
    setUser(null)
    setToken(null)
  }, [])

  const hasRole = useCallback(
    (...roles) => user && roles.includes(user.role),
    [user]
  )

  return (
    <AuthContext.Provider
      value={{ user, token, tokenReady, login, logout, hasRole, sessionError }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export default AuthContext
