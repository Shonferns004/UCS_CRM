const BASE = import.meta.env.VITE_API_URL || 'https://ucs-crm-backend.vercel.app/api'

export function setSession(prefix, token, user) {
  localStorage.setItem(`${prefix}_token`, token)
  localStorage.setItem(`${prefix}_user`, JSON.stringify(user))
}

export function clearSession(prefix) {
  localStorage.removeItem(`${prefix}_token`)
  localStorage.removeItem(`${prefix}_user`)
}

export function getToken(prefix) {
  return localStorage.getItem(`${prefix}_token`)
}

export function getUser(prefix) {
  try { const d = localStorage.getItem(`${prefix}_user`); return d ? JSON.parse(d) : null }
  catch { return null }
}

export async function api(path, options = {}) {
  const token = getToken(options._prefix || 'ucs')
  const isFormData = options.body instanceof FormData
  const headers = { ...options.headers }
  if (!isFormData) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`
  const timeoutController = new AbortController()
  const timeout = setTimeout(() => timeoutController.abort(), options.timeout || 120000)
  const externalSignal = options.signal || null
  const combinedSignal = externalSignal
    ? AbortSignal.any([timeoutController.signal, externalSignal])
    : timeoutController.signal
  try {
    const res = await fetch(`${BASE}${path}`, { ...options, headers, signal: combinedSignal })
    if (res.status === 401) {
      clearSession(options._prefix || 'ucs')
      throw new Error('Session expired. Please login again.')
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }))
      throw new Error(err.message || `Request failed: ${res.status}`)
    }
    if (options.raw) return res
    return res.json()
  } finally {
    clearTimeout(timeout)
  }
}

export async function login(identifier, password) {
  return api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
    _prefix: 'ucs',
  })
}
