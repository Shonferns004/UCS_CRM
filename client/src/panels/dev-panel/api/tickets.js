import { api } from '../../../api/auth'

const p = (path, opts) => api(path, { _prefix: 'ucs', ...opts })

// ── Unified fetch ──────────────────────────────────────────────────
// Gets tickets from BOTH /tickets and /developer-tickets, tags each
// with _source so consumers know which system owns the ticket.

export const getUnifiedDevTickets = async (params = {}) => {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v) })
  const s = qs.toString()
  const [regular, dev] = await Promise.all([
    p(`/tickets${s ? '?' + s : ''}`).catch(() => []),
    p(`/developer-tickets${s ? '?' + s : ''}`).catch(() => []),
  ])
  return [
    ...(regular || []).map(t => ({ ...t, _source: 'regular' })),
    ...(dev || []).map(t => ({ ...t, _source: 'developer' })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export const getMyUnifiedTickets = async () => {
  const [regular, dev] = await Promise.all([
    p('/tickets/my').catch(() => []),
    p('/developer-tickets/my').catch(() => []),
  ])
  return [
    ...(regular || []).map(t => ({ ...t, _source: 'regular' })),
    ...(dev || []).map(t => ({ ...t, _source: 'developer' })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

// ── Developer ticket endpoints ─────────────────────────────────────

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

export const resolveDevTicket = (id, resolution) =>
  p(`/developer-tickets/${id}/resolve`, { method: 'PUT', body: JSON.stringify({ resolution }) })

export const approveDevTicket = (id) =>
  p(`/developer-tickets/${id}/approve`, { method: 'PUT' })

export const rejectDevTicket = (id, reason) =>
  p(`/developer-tickets/${id}/reject`, { method: 'PUT', body: JSON.stringify({ reason }) })

// ── Regular (support) ticket endpoints ─────────────────────────────

export const getRegularTicket = (id) => p(`/tickets/${id}`)

export const updateRegularTicket = (id, data) =>
  p(`/tickets/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const replyToRegularTicket = (id, data) =>
  p(`/tickets/${id}/reply`, { method: 'POST', body: JSON.stringify(data) })

export const resolveRegularTicket = (id, resolution) =>
  p(`/tickets/${id}/resolve`, { method: 'PUT', body: JSON.stringify({ resolution }) })

export const approveRegularTicket = (id) =>
  p(`/tickets/${id}/approve`, { method: 'PUT' })

export const rejectRegularTicket = (id, reason) =>
  p(`/tickets/${id}/reject`, { method: 'PUT', body: JSON.stringify({ reason }) })

// ── Source-aware helpers ───────────────────────────────────────────
// Route operations to the correct backend based on _source tag.

export const getTicketBySource = (id, source) =>
  source === 'developer' ? getDevTicket(id) : getRegularTicket(id)

export const updateTicketBySource = (id, data, source) =>
  source === 'developer' ? updateDevTicket(id, data) : updateRegularTicket(id, data)

export const replyToTicketBySource = (id, data, source) =>
  source === 'developer' ? replyToDevTicket(id, data) : replyToRegularTicket(id, data)

export const resolveTicketBySource = (id, resolution, source) =>
  source === 'developer' ? resolveDevTicket(id, resolution) : resolveRegularTicket(id, resolution)
