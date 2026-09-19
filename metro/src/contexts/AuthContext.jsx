import React, { createContext, useState, useCallback, useEffect } from 'react'
import { login as loginService, getMe } from '../services/auth.service.js'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [tokenReady, setTokenReady] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('mpc_token')
    if (stored) {
      setToken(stored)
      getMe()
        .then((u) => setUser(u))
        .catch(() => {
          localStorage.removeItem('mpc_token')
          setToken(null)
        })
        .finally(() => setTokenReady(true))
    } else {
      setTokenReady(true)
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const data = await loginService(email, password)
    const newToken = data.token
    localStorage.setItem('mpc_token', newToken)
    setToken(newToken)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('mpc_token')
    setToken(null)
    setUser(null)
  }, [])

  const hasRole = useCallback(
    (...roles) => user && roles.includes(user.role),
    [user]
  )

  return (
    <AuthContext.Provider value={{ user, token, tokenReady, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  )
}

export default AuthContext
