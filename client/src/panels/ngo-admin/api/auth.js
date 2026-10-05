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

// ─── CRM login agents ("Agent N") ───────────────────────────────────────────
//
// The create / reset calls resolve to the plaintext password, which the backend
// returns exactly once and never again. Nothing here caches it.

export function listCrmAgents() {
  return apiGet('/ngo-admin/agents')
}

export function getCrmAgentFroOptions() {
  return apiGet('/ngo-admin/agents/fro-options')
}

export function createCrmAgent(payload) {
  return apiPost('/ngo-admin/agents', payload)
}

export function setCrmAgentActive(id, isActive) {
  return apiPatch(`/ngo-admin/agents/${id}/status`, { is_active: isActive })
}

export function setCrmAgentAssignment(id, workerId) {
  return apiPatch(`/ngo-admin/agents/${id}/assignment`, { worker_id: workerId })
}

export function resetCrmAgentPassword(id, password) {
  return apiPost(`/ngo-admin/agents/${id}/reset-password`, password ? { password } : {})
}

export function forceLogoutCrmAgent(id) {
  return apiPost(`/ngo-admin/agents/${id}/force-logout`, {})
}

export function deleteCrmAgent(id) {
  return api(`/ngo-admin/agents/${id}`, { method: 'DELETE', _prefix: 'ucs' })
}

export function bulkCreateCrmAgents(payload) {
  return apiPost('/ngo-admin/agents/bulk', payload)
}

export { setSession, clearSession, getToken, getUser } from '../../../api/auth'
