import { api } from '../../../api/auth'

const p = (path, opts) => api(path, { _prefix: 'ucs', ...opts })

export const getDevTickets = (params = {}) => {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v) })
  const s = qs.toString()
  return p(`/developer-tickets${s ? '?' + s : ''}`)
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
