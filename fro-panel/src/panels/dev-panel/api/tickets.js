import { api } from '../../../api/auth'

const p = (path, opts) => api(path, { _prefix: 'ucs', ...opts })

// Unified fetch - gets tickets from both sources
export const getUnifiedDevTickets = (params = {}) => {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v) })
  const s = qs.toString()
  // Fetch both sources in parallel
  return Promise.all([
    p(`/tickets${s ? '?' + s : ''}`),
    p(`/developer-tickets${s ? '?' + s : ''}`)
  ]).then(([regular, dev]) => [
    ...(regular || []).map(t => ({ ...t, source: 'account_panel' })),
    ...(dev || []).map(t => ({ ...t, source: 'panel' })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))
}

export const getDevTicketStats = () => p('/developer-tickets/stats')
export const getMyDevTickets = () => p('/developer-tickets/my')
export const getUnassignedTickets = () => p('/developer-tickets/unassigned')
export const getDevTicket = (id) => p(`/developer-tickets/${id}`)
export const getDevAssignees = () => p('/developer-tickets/assignees')

export const createDevTicket = (data) =>
  p('/developer-tickets', { method: 'POST', body: JSON.stringify(data) })

export const updateDevTicket = (id, data) =>
  p(`/developer-tickets/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const replyToDevTicket = (id, data) =>
  p(`/developer-tickets/${id}/reply`, { method: 'POST', body: JSON.stringify(data) })

export const bulkUpdateDevTickets = (ids, updates) =>
  p('/developer-tickets/bulk', { method: 'PUT', body: JSON.stringify({ ids, updates }) })

// New mutation functions for resolve/approve/reject with notifications
export const resolveDevTicket = (id, resolution) =>
  p(`/developer-tickets/${id}/resolve`, { method: 'PUT', body: JSON.stringify({ resolution }) })

export const approveDevTicket = (id) =>
  p(`/developer-tickets/${id}/approve`, { method: 'PUT' })

export const rejectDevTicket = (id, reason) =>
  p(`/developer-tickets/${id}/reject`, { method: 'PUT', body: JSON.stringify({ reason }) })

// Also support regular tickets if needed
export const resolveRegularTicket = (id, resolution) =>
  p(`/tickets/${id}/resolve`, { method: 'PUT', body: JSON.stringify({ resolution }) })

export const approveRegularTicket = (id) =>
  p(`/tickets/${id}/approve`, { method: 'PUT' })

export const rejectRegularTicket = (id, reason) =>
  p(`/tickets/${id}/reject`, { method: 'PUT', body: JSON.stringify({ reason }) })
