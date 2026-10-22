import { io } from 'socket.io-client'
import { API_BASE } from './apiBase'

let socket = null
let authRetries = 0
let authRetryTimer = null

function getBaseUrl() {
  const override = import.meta.env.VITE_SOCKET_URL
  if (override) return override
  return API_BASE.replace(/\/api\/?$/, '')
}

function getToken() {
  try { return localStorage.getItem('ucs_token') } catch { return null }
}

// The token is read at HANDSHAKE time, not at construction time.
//
// This module is loaded by components that mount before the user has signed in
// (MeetingGate -> useMeeting -> onDbChange -> getSocket runs on the login
// page, because MeetingGate sits at App level outside the protected routes).
// A token captured once at construction was therefore `null` for the whole
// session: the server rejected the handshake with "unauthorized" and the
// socket stayed dead, so no db:change event ever reached the panels and rows
// only appeared to update after a manual page refresh.
//
// Passing `auth` as a callback makes socket.io re-read the token on every
// connect attempt, so the retry that follows the failed first handshake
// carries the token the user obtained by logging in.
function authPayload(cb) {
  cb({ token: getToken() })
}

// A server-side rejection (CONNECT_ERROR) makes socket.io tear the socket
// down AND suppress its own reconnection, so the socket never recovers on its
// own. The same is true of a dropped connection. Retry here, but only once a
// token exists - without one the handshake cannot succeed, and login triggers
// an explicit reconnect instead.
function scheduleAuthRetry() {
  if (authRetryTimer) return
  if (!getToken()) return
  if (authRetries >= 20) return
  const delay = Math.min(1000 * 2 ** authRetries, 10000)
  authRetries += 1
  authRetryTimer = setTimeout(() => {
    authRetryTimer = null
    const s = socket
    if (!s || s.connected) return
    try { s.connect() } catch { /* next connect_error will reschedule */ }
  }, delay)
}

export function getSocket() {
  if (socket) return socket
  socket = io(getBaseUrl(), {
    transports: ['websocket'],
    auth: authPayload,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
  })
  socket.on('connect', () => {
    authRetries = 0
    if (authRetryTimer) {
      clearTimeout(authRetryTimer)
      authRetryTimer = null
    }
  })
  // Both of these leave the socket unable to receive anything. socket.io's own
  // reconnection does not cover a rejected handshake (it suppresses it), and a
  // dropped connection can be the result of a token that expired in between.
  socket.on('connect_error', () => {
    scheduleAuthRetry()
  })
  socket.on('disconnect', () => {
    scheduleAuthRetry()
  })
  return socket
}

// Reconnect with the token currently in localStorage. Called after login so
// the socket that was created on the login page (and rejected for having no
// token) comes up immediately instead of waiting for the backoff retry.
export function reconnectSocket() {
  const s = getSocket()
  if (s.connected) return s
  if (authRetryTimer) {
    clearTimeout(authRetryTimer)
    authRetryTimer = null
  }
  authRetries = 0
  try { s.connect() } catch { /* already tearing down; the next attempt will retry */ }
  return s
}

export function onDbChange({ table, event = '*', filter, onInsert, onUpdate, onDelete }) {
  const s = getSocket()
  const handler = (payload) => {
    if (!payload) return
    if (table && payload.table !== table) return
    if (event !== '*' && event !== payload.eventType) return
    if (typeof filter === 'function' && !filter(payload)) return
    if (payload.eventType === 'INSERT' && onInsert) onInsert(payload.new, payload)
    if (payload.eventType === 'UPDATE' && onUpdate) onUpdate(payload.new, payload.old, payload)
    if (payload.eventType === 'DELETE' && onDelete) onDelete(payload.old, payload)
  }
  s.on('db:change', handler)
  return () => s.off('db:change', handler)
}

export function onFroAction(handler) {
  const s = getSocket()
  s.on('fro:action', handler)
  return () => s.off('fro:action', handler)
}

export function onFroBroadcast(handler) {
  const s = getSocket()
  s.on('fro:broadcast', handler)
  return () => s.off('fro:broadcast', handler)
}

export function onFroTeamBroadcast(handler) {
  const s = getSocket()
  s.on('fro:team-broadcast', handler)
  return () => s.off('fro:team-broadcast', handler)
}

export function onFroForceLogout(handler) {
  const s = getSocket()
  s.on('fro:force-logout', handler)
  return () => s.off('fro:force-logout', handler)
}

export function onFroPause(handler) {
  const s = getSocket()
  s.on('fro:pause', handler)
  return () => s.off('fro:pause', handler)
}

export function onFroResume(handler) {
  const s = getSocket()
  s.on('fro:resume', handler)
  return () => s.off('fro:resume', handler)
}

export function onSocketConnect(handler) {
  const s = getSocket()
  s.on('connect', handler)
  return () => s.off('connect', handler)
}
