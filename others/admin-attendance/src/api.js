import { API_BASE } from './config'

const TOKEN_KEY = 'shon_token'
const USER_KEY = 'shon_user'

export function setSession(token, email, readOnly) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify({ email, readOnly }))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function getUser() {
  try { const d = localStorage.getItem(USER_KEY); return d ? JSON.parse(d) : null }
  catch { return null }
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

async function request(method, path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || 'Request failed')
  return data
}

const ADMIN_ROLES = ['super_admin', 'admin']

export async function login(identifier, password) {
  try {
    const admin = await request('POST', 'auth/admin/login', { email: identifier, password })
    return { token: admin.token, email: identifier, readOnly: false }
  } catch {
    const worker = await request('POST', 'auth/login', { identifier, password })
    const readOnly = !ADMIN_ROLES.includes(worker.role)
    return { token: worker.token, email: worker.user?.login_id || worker.user?.email || identifier, readOnly }
  }
}

export async function fetchAttendance() {
  const data = await request('GET', 'attendance/all')
  return Array.isArray(data) ? data : []
}

export async function fetchWorkers() {
  const data = await request('GET', 'workers')
  return Array.isArray(data) ? data : []
}

export function updateAttendance(id, updates) {
  return request('PUT', `attendance/${id}`, updates)
}

export function deleteAttendance(id) {
  return request('DELETE', `attendance/${id}`)
}

export function addAttendance(payload) {
  return request('POST', 'attendance', payload)
}
