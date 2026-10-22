// Reusable native-WebSocket client for the uWebSockets.js realtime service.
//
// Preserves the public API of the old socket.io client module so existing
// callers (onDbChange, onFroAction, ..., chatApi) keep working unchanged.
import { API_BASE } from './apiBase'

let socket = null // underlying WebSocket
let shim = null
const listeners = new Map() // type -> Set<handler>
let connected = false
let authRetries = 0
let authRetryTimer = null
let currentSocket = null

function getToken() {
  try { return localStorage.getItem('ucs_token') } catch { return null }
}

function getWsUrl() {
  const override = import.meta.env.VITE_WS_URL
  if (override) return override
  const base = import.meta.env.VITE_SOCKET_URL || API_BASE.replace(/\/api\/?$/, '')
  try {
    const u = new URL(base)
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:'
    const port = import.meta.env.VITE_WS_PORT || '5001'
    return `${proto}//${u.hostname}:${port}`
  } catch {
    return 'ws://localhost:5001'
  }
}

function addListener(type, handler) {
  if (!listeners.has(type)) listeners.set(type, new Set())
  listeners.get(type).add(handler)
}
function removeListener(type, handler) {
  const set = listeners.get(type)
  if (set) { set.delete(handler); if (set.size === 0) listeners.delete(type) }
}
function dispatch(type, payload) {
  const set = listeners.get(type)
  if (!set) return
  for (const h of Array.from(set)) {
    try { h(payload) } catch (e) { console.warn('[ws] handler error:', e?.message || e) }
  }
}

function scheduleAuthRetry() {
  if (authRetryTimer) return
  if (!getToken()) return
  if (authRetries >= 20) return
  const base = Math.min(1000 * 2 ** authRetries, 10000)
  const jitter = Math.random() * base * 0.3
  const delay = base + jitter
  authRetries += 1
  authRetryTimer = setTimeout(() => {
    authRetryTimer = null
    const s = currentSocket
    if (s && s.readyState === WebSocket.OPEN) return
    connect()
  }, delay)
}

function connect() {
  if (currentSocket && (currentSocket.readyState === WebSocket.CONNECTING || currentSocket.readyState === WebSocket.OPEN)) {
    return shim
  }
  let s
  try { s = new WebSocket(getWsUrl()) } catch (e) {
    console.warn('[ws] construct failed:', e?.message || e)
    scheduleAuthRetry()
    return shim
  }
  currentSocket = s

  s.onopen = () => {
    const token = getToken()
    if (token) {
      try { s.send(JSON.stringify({ type: 'auth', payload: { token } })) } catch { /* ignore */ }
    } else {
      // No token yet: server will close; login triggers reconnectSocket().
    }
  }
  s.onmessage = (ev) => {
    let msg
    try { msg = JSON.parse(ev.data) } catch { return }
    if (!msg || typeof msg.type !== 'string') return
    if (msg.type === 'auth:ok') {
      connected = true
      authRetries = 0
      if (authRetryTimer) { clearTimeout(authRetryTimer); authRetryTimer = null }
      dispatch('connect', undefined)
      return
    }
    if (msg.type === 'auth:error') {
      connected = false
      try { s.close() } catch { /* ignore */ }
      return
    }
    if (msg.type === 'pong') return
    dispatch(msg.type, msg.payload)
  }
  s.onclose = () => {
    if (currentSocket !== s) return
    currentSocket = null
    const wasConnected = connected
    connected = false
    if (wasConnected) dispatch('disconnect', undefined)
    scheduleAuthRetry()
  }
  s.onerror = () => { /* onclose will handle */ }

  return shim
}

shim = {
  get connected() { return connected },
  on(type, handler) {
    addListener(type, handler)
    return shim
  },
  off(type, handler) {
    removeListener(type, handler)
    return shim
  },
  emit(type, payload) {
    const s = currentSocket
    if (s && s.readyState === WebSocket.OPEN) {
      try { s.send(JSON.stringify({ type, payload })) } catch { /* ignore */ }
    }
    return shim
  },
  connect() { return connect() },
  close() {
    const s = currentSocket
    if (s) {
      try { s.close() } catch { /* ignore */ }
      currentSocket = null
    }
    connected = false
  },
}

export function getSocket() {
  if (!currentSocket) connect()
  return shim
}

export function reconnectSocket() {
  authRetries = 0
  if (authRetryTimer) { clearTimeout(authRetryTimer); authRetryTimer = null }
  const s = currentSocket
  if (s) {
    try { s.onclose = null } catch { /* ignore */ }
    try { s.close() } catch { /* ignore */ }
    currentSocket = null
  }
  connected = false
  return connect()
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
