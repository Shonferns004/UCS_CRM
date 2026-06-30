const BASE = import.meta.env.VITE_API_URL || 'https://attendance-roan-zeta.vercel.app/api'

export function setSession(token, user) {
  localStorage.setItem('shon_token', token)
  localStorage.setItem('shon_user', JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem('shon_token')
  localStorage.removeItem('shon_user')
}

export function getToken() {
  return localStorage.getItem('shon_token')
}

export function getUser() {
  try { const d = localStorage.getItem('shon_user'); return d ? JSON.parse(d) : null }
  catch { return null }
}

function handleAuthExpired() {
  clearSession()
  window.dispatchEvent(new CustomEvent('auth:expired'))
}

export async function api(path, options = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    if (res.status === 401) handleAuthExpired()
    throw new Error(body.message || `Request failed: ${res.status}`)
  }
  return res.json()
}

export const apiGet = (path) => api(path, { method: 'GET' })
export const apiPost = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) })
export const apiPut = (path, body) => api(path, { method: 'PUT', body: JSON.stringify(body) })
export const apiDelete = (path) => api(path, { method: 'DELETE' })

export async function login(identifier, password) {
  const data = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  })
  setSession(data.token, data.user || data)
  return data
}
