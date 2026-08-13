import { apiGet, apiPost } from './auth'

export async function getPendingLeads(status) {
  const s = status || 'pending'
  return apiGet(`/ngo-admin/accounts/pending?status=${s}`)
}

export async function verifyLead(logId, data) {
  return apiPost(`/ngo-admin/accounts/${logId}/verify`, data)
}
