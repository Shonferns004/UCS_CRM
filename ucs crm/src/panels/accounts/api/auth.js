import { api } from '../../../api/auth'
export { api } from '../../../api/auth'

export async function login(email, password) {
  const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ identifier: email, password }), _prefix: 'ucs' })
  if (data.role !== 'accounts' && data.role !== 'super_admin') throw new Error('Access denied. Accounts or Admin account required.')
  return data
}

export function apiGet(path) { return api(path, { _prefix: 'ucs' }) }
const serialize = (body) => (body instanceof FormData ? body : JSON.stringify(body))
export function apiPost(path, body, timeout) { return api(path, { method: 'POST', body: serialize(body), _prefix: 'ucs', timeout }) }
export function apiPut(path, body) { return api(path, { method: 'PUT', body: serialize(body), _prefix: 'ucs' }) }
export function apiPatch(path, body) { return api(path, { method: 'PATCH', body: serialize(body), _prefix: 'ucs' }) }
export function apiDelete(path) { return api(path, { method: 'DELETE', _prefix: 'ucs' }) }
