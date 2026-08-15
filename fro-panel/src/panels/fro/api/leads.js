import { api } from './auth'

export async function fetchMyLeads() {
  return api('/leads', { _prefix: 'ucs' })
}

export async function fetchLeadById(id) {
  return api(`/leads/${id}`, { _prefix: 'ucs' })
}

export async function updateLead(id, data) {
  return api(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(data), _prefix: 'ucs' })
}
