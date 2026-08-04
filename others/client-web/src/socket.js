import { io } from 'socket.io-client'
import { SOCKET_URL, CACHE_KEYS } from './config'

let socket = null
let currentToken = null

function getSocket() {
  const token = (() => {
    try { return localStorage.getItem(CACHE_KEYS.TOKEN) } catch { return null }
  })()
  if (!socket || currentToken !== token) {
    if (socket) socket.disconnect()
    currentToken = token
    socket = io(SOCKET_URL, { transports: ['websocket'], auth: { token } })
  }
  return socket
}

const TABLE_EVENTS = {
  attendance: 'attendance',
  leaves: 'leaves',
  loans: 'loans',
  notification_log: 'notifications',
  attendance_corrections: 'corrections',
}

export function subscribeWorker(workerId, onEvent) {
  const s = getSocket()
  const listeners = []
  for (const [table, event] of Object.entries(TABLE_EVENTS)) {
    const handler = (payload) => {
      if (payload?.table !== table) return
      const row = payload.new || payload.old || {}
      if (row.worker_id != null && String(row.worker_id) !== String(workerId)) return
      onEvent(event)
    }
    s.on('db:change', handler)
    listeners.push(handler)
  }
  return () => {
    for (const handler of listeners) s.off('db:change', handler)
    listeners.length = 0
  }
}
