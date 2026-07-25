import { api as baseApi } from '../../../api/auth'
export { setSession, clearSession } from '../../../api/auth'
export function getToken() { try { return localStorage.getItem('ucs_token') } catch { return null } }
export function getUser() { try { const d = localStorage.getItem('ucs_user'); return d ? JSON.parse(d) : null } catch { return null } }
export function authHeaders() {
  const t = getToken()
  return t ? { 'Authorization': `Bearer ${t}` } : {}
}
export async function api(path, options = {}) {
  return baseApi(path, { ...options, _prefix: 'ucs' })
}
export async function login(identifier, password) {
  return baseApi('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }), _prefix: 'ucs' })
}
