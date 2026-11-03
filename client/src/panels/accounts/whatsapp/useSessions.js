import { useCallback, useEffect, useState } from 'react'
import { gateway } from './gateway'
import { errorMessage } from './ui'

// Shared session picker for the gateway sections.
export function useSessions() {
  const [sessions, setSessions] = useState([])
  const [sessionId, setSessionId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await gateway.listSessions()
      const list = Array.isArray(data) ? data : []
      setSessions(list)
      setSessionId((current) => {
        if (current && list.some((session) => session.id === current)) return current
        const ready = list.find((session) => session.status === 'ready')
        return ready?.id || list[0]?.id || ''
      })
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { sessions, sessionId, setSessionId, error, loading, reload }
}
