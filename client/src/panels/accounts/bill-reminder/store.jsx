import { createContext, useContext, useState, useEffect } from 'react'
import { getUser, fetchReminders, fetchNotifications, fetchSettings } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children, initialUser }) {
  const [user, setUser] = useState(() => initialUser || getUser())

  const logout = () => {
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useUcs() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useUcs must be used within AuthProvider')
  return ctx
}

function has(value) {
  return value != null && String(value).trim() !== ''
}

function norm(str) {
  return String(str || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\u2013\u2014–—]/g, '-')
    .replace(/[^a-z0-9\s-]/g, '')
}

function bestReminder(a, b) {
  const score = (r) =>
    (has(r.due_date) ? 4 : 0) +
    (has(r.amount) && Number(r.amount) > 0 ? 2 : 0) +
    (has(r.due_date_display) ? 1 : 0)
  const sa = score(a)
  const sb = score(b)
  if (sa !== sb) return sa > sb ? a : b
  const ia = Number(a.id) || 0
  const ib = Number(b.id) || 0
  return ia !== ib ? (ia < ib ? a : b) : a
}

export const RemContext = createContext(null)

export function RemProvider({ children }) {
  const [reminders, setReminders] = useState([])
  const [loading, setLoading] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [settings, setSettings] = useState(null)
  const [activeFilter, setActiveFilter] = useState(() => {
    try { return sessionStorage.getItem('rem_active_filter') || '' } catch { return '' }
  })

  useEffect(() => {
    try { sessionStorage.setItem('rem_active_filter', activeFilter) } catch { /* ignore */ }
  }, [activeFilter])

  const refresh = async () => {
    setLoading(true)
    try {
      const data = await fetchReminders()
      if (Array.isArray(data)) {
        const seen = new Map()
        for (const r of data) {
          if (!r || r.is_deleted) continue
          const key = [norm(r.title), norm(r.category), norm(r.owner)].join('||')
          const prev = seen.get(key)
          if (!prev) { seen.set(key, r); continue }
          seen.set(key, bestReminder(prev, r))
        }
        setReminders(Array.from(seen.values()))
      }
    } catch { /* keep current */ }
    finally { setLoading(false) }
  }

  const refreshNotifications = async () => {
    try {
      const data = await fetchNotifications()
      if (Array.isArray(data)) setNotifications(data)
    } catch { /* keep current */ }
  }

  const refreshSettings = async () => {
    try {
      const data = await fetchSettings()
      setSettings(data && data.id ? data : null)
    } catch { /* keep current */ }
  }

  return (
    <RemContext.Provider value={{
      reminders, setReminders, loading, refresh,
      notifications, setNotifications, refreshNotifications,
      settings, setSettings, refreshSettings,
      activeFilter, setActiveFilter,
    }}>
      {children}
    </RemContext.Provider>
  )
}

export function useRem() {
  const ctx = useContext(RemContext)
  if (!ctx) throw new Error('useRem must be used within RemProvider')
  return ctx
}
