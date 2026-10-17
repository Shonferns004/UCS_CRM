import { api } from '../../../api/auth'

export async function login(email, password) {
  const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ identifier: email, password }), _prefix: 'ucs' })
  if (data.role !== 'admin' && data.role !== 'super_admin') throw new Error('Access denied. Admin account required.')
  return data
}

export function apiGet(path, opts = {}) { return api(path, { ...opts, _prefix: 'ucs' }) }
export function apiPost(path, body) { return api(path, { method: 'POST', body: JSON.stringify(body), _prefix: 'ucs' }) }
export function apiPut(path, body) { return api(path, { method: 'PUT', body: JSON.stringify(body), _prefix: 'ucs' }) }
export function apiPatch(path, body) { return api(path, { method: 'PATCH', body: JSON.stringify(body), _prefix: 'ucs' }) }
export function apiDelete(path) { return api(path, { method: 'DELETE', _prefix: 'ucs' }) }

export async function masterSearch(q) {
  return apiGet(`/ngo-admin/master-search?q=${encodeURIComponent(q)}`)
}

export async function getFroHourlyPerformance(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return apiGet(`/ngo-admin/fro-hourly-performance${qs ? '?' + qs : ''}`)
}

export async function getFroDailyStats(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return apiGet(`/ngo-admin/fro-daily-stats${qs ? '?' + qs : ''}`)
}

export async function getStationWiseCollection(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return apiGet(`/ngo-admin/station-collection${qs ? '?' + qs : ''}`)
}

export async function getTeamWiseCollection(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return apiGet(`/ngo-admin/team-collection${qs ? '?' + qs : ''}`)
}

export function notifyFro(workerId) {
  return apiPost('/ngo-admin/notify-fro', { workerId })
}

export function generateImpersonationCode() {
  return apiPost('/impersonation-codes/generate')
}

export function listImpersonationCodes() {
  return apiGet('/impersonation-codes')
}

export function listAllImpersonationCodes() {
  return apiGet('/impersonation-codes/all')
}

// ─── Temporary Data Access (admin permission layer) ──────────────────────────
// Wraps /ngo-admin/temporary-access*. All calls are admin-guarded server-side;
// a 503 with code TEMP_ACCESS_DISABLED means the feature flag is off.

export function listTemporaryAccess(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return apiGet(`/ngo-admin/temporary-access${qs ? '?' + qs : ''}`)
}

export function getTemporaryAccess(id) {
  return apiGet(`/ngo-admin/temporary-access/${id}`)
}

export function validateTemporaryAccess(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return apiGet(`/ngo-admin/temporary-access/validate${qs ? '?' + qs : ''}`)
}

export function createTemporaryAccess(body) {
  return apiPost('/ngo-admin/temporary-access', body)
}

export function extendTemporaryAccess(id, body) {
  return apiPost(`/ngo-admin/temporary-access/${id}/extend`, body)
}

export function revokeTemporaryAccess(id, body) {
  return apiPost(`/ngo-admin/temporary-access/${id}/revoke`, body)
}

export { setSession, clearSession, getToken, getUser } from '../../../api/auth'
