import React, { createContext, useState, useCallback, useEffect } from 'react'
import { getMe } from '../services/auth.service.js'

export const AuthContext = createContext(null)

// Metropad runs inside the Super Admin panel. It deliberately has NO separate
// login: the accounts-panel session token (ucs_token) is reused, and the
// backend maps the signed-in accounts email onto the metropad user.
export function AuthProvider({ children }) {
  const [user, setUser] = useState({ role: 'ADMIN', name: 'Operator', email: '' })
  const [token, setToken] = useState(null)
  const [tokenReady, setTokenReady] = useState(false)
  const [sessionError, setSessionError] = useState(null)

  useEffect(() => {
    const stored = localStorage.getItem('ucs_token')
    if (stored) {
      setToken(stored)
      getMe()
        .then((u) => setUser({ role: 'ADMIN', name: 'Operator', email: '', ...u }))
        .catch(() => setTokenReady(true))
        .finally(() => setTokenReady(true))
    } else {
      setTokenReady(true)
    }
  }, [])

  const login = useCallback(async () => null, [])

  const logout = useCallback(() => {
    localStorage.removeItem('ucs_token')
    setToken(null)
  }, [])

  const hasRole = useCallback(() => true, [])

  return (
    <AuthContext.Provider
      value={{ user, token, tokenReady, login, logout, hasRole, sessionError }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export default AuthContext
