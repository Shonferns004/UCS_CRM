import { api as baseApi } from '../../../api/auth'

export function getToken() { try { return localStorage.getItem('ucs_token') } catch { return null } }
export function getUser() { try { const d = localStorage.getItem('ucs_user'); return d ? JSON.parse(d) : null } catch { return null } }
export function setSession(token, user) { localStorage.setItem('ucs_token', token); localStorage.setItem('ucs_user', JSON.stringify(user)) }
export function clearSession() { localStorage.removeItem('ucs_token'); localStorage.removeItem('ucs_user') }

export async function api(path, options = {}) {
  return baseApi(path, { ...options, _prefix: 'ucs' })
}

export async function login(email, password) {
  const data = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: email, password }),
    _prefix: 'ucs',
  })
  if (data.role !== 'super_admin') throw new Error('Access denied. Super Admin account required.')
  return data
}
