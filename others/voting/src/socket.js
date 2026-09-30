import { io } from 'socket.io-client'
import { SOCKET_URL } from './config'
import { getSession } from './api'

let socket = null

/**
 * Realtime is an optimisation, never a requirement. The whole app works by
 * polling (see the ceremony refresh interval in App.jsx) - this just makes the
 * wait feel immediate when a turn opens. A booth on a flaky venue wifi should
 * still function, so a socket failure is swallowed rather than surfaced.
 */
export function getSocket() {
  if (socket) return socket
  const token = getSession()?.token
  if (!token) return null

  socket = io(SOCKET_URL, {
    transports: ['websocket'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
  })
  return socket
}

export function onVotingUpdate(handler) {
  const s = getSocket()
  if (!s) return () => {}
  s.on('voting:update', handler)
  return () => s.off('voting:update', handler)
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
