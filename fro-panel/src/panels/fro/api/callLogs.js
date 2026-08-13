import { api } from './auth'

export async function fetchCallLogs(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return api(`/call-logs${qs ? '?' + qs : ''}`, { _prefix: 'ucs' })
}

export async function fetchLeadCallLogs(leadId) {
  return api(`/call-logs/lead/${leadId}`, { _prefix: 'ucs' })
}

export async function addCallLog(data) {
  return api('/call-logs', { method: 'POST', body: JSON.stringify(data), _prefix: 'ucs' })
}
