import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getSession } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSessionState] = useState(() => getSession())
  const user = session?.user || null

  // A tab left open all ceremony will hold a token whose CRM expiry has passed.
  // The API answers 401, api.js clears the session, and re-rendering here drops
  // us back to the login screen rather than looping on failed requests.
  useEffect(() => {
    const onSession = () => setSessionState(getSession())
    window.addEventListener('voting:session', onSession)
    const onStorage = (e) => {
      if (e.key === 'voting_session') setSessionState(getSession())
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('voting:session', onSession)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      token: session?.token || '',
      isAuthed: !!session?.token,
      setSession: setSessionState,
    }),
    [session, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
