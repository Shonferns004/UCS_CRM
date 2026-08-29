import { API_BASE } from './config'

const TOKEN_KEY = 'sim_card_token'
const USER_KEY = 'sim_card_user'

export function setSession(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function getUser() {
  try { const d = localStorage.getItem(USER_KEY); return d ? JSON.parse(d) : null }
  catch { return null }
}

export async function request(method, path, body) {
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

export async function login(identifier, password) {
  const worker = await request('POST', 'auth/login', { identifier, password })
  const user = worker.user || {}
  const fullUser = {
    ...user,
    id: user.id || worker.id,
    login_id: user.login_id || user.email || identifier,
    role: worker.role || user.role,
    department: user.department,
    name: user.name || user.login_id || identifier,
  }
  return { token: worker.token, user: fullUser }
}

export async function fetchSimCards() {
  return request('GET', 'sim-cards')
}

export async function addSimCard(payload) {
  return request('POST', 'sim-cards', payload)
}

export async function updateSimCard(id, payload) {
  return request('PUT', `sim-cards/${id}`, payload)
}

export async function deleteSimCard(id) {
  return request('DELETE', `sim-cards/${id}`)
}

export async function replaceSimCard(id, payload) {
  return request('POST', `sim-cards/${id}/replace`, payload)
}

export async function fetchReplacements() {
  return request('GET', 'sim-cards/replacements')
}

export async function importSimCards(rows) {
  return request('POST', 'sim-cards/import', { rows })
}

export async function bulkChangeStatus(ids, status) {
  return request('POST', 'sim-cards/replacements/bulk', { ids, status })
}

export async function bulkDelete(ids) {
  return request('POST', 'sim-cards/replacements/bulk-delete', { ids })
}

export async function fetchInventory() {
  return request('GET', 'sim-inventory')
}

export async function addInventoryItem(payload) {
  return request('POST', 'sim-inventory', payload)
}

export async function updateInventoryItem(id, payload) {
  return request('PUT', `sim-inventory/${id}`, payload)
}

export async function assignInventoryItem(id, payload) {
  return request('POST', `sim-inventory/${id}/assign`, payload)
}

export async function updateInventoryStatus(id, status) {
  return request('POST', `sim-inventory/${id}/status`, { status })
}

export async function deleteInventoryItem(id) {
  return request('DELETE', `sim-inventory/${id}`)
}

export async function importInventoryItems(rows) {
  return request('POST', 'sim-inventory/import', { rows })
}
