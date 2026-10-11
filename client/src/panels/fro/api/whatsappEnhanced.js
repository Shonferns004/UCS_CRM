import { api } from './auth'
import { API_BASE } from '../../../lib/apiBase'

function agentApi(path, options = {}, agentToken) {
  if (agentToken) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}), Authorization: `Bearer ${agentToken}` }
    return fetch(`${API_BASE}${path}`, { ...options, headers }).then(async r => {
      const payload = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(payload.error || payload.message || r.statusText)
      return payload
    })
  }
  return api(path, options)
}

export async function getMyAccounts(agentToken) {
  return agentApi('/fro/whatsapp/my-accounts', {}, agentToken)
}

// `filters` adds the standalone inbox's list controls: unread-only, one or more
// statuses, a contact search term, and a label. Each maps to a column/indexed
// predicate on the server, so they page correctly rather than hiding rows the
// caller was never sent.
export async function getConversations(userId, agentToken, project, filters = {}) {
  const qs = new URLSearchParams()
  if (project) qs.set('project', project)
  if (filters.unread) qs.set('unread', 'true')
  if (filters.statuses?.length) qs.set('status', filters.statuses.join(','))
  if (filters.search) qs.set('q', filters.search)
  if (filters.label) qs.set('label', filters.label)
  if (filters.limit) qs.set('limit', String(filters.limit))
  const suffix = qs.toString() ? `?${qs}` : ''
  return agentApi(`/fro/whatsapp/agent-conversations${suffix}`, {}, agentToken)
}

export async function getUnreadCount(userId, agentToken) {
  return agentApi('/fro/whatsapp/agent-conversations/unread-count', {}, agentToken)
}

export async function getMessages(conversationId, agentToken) {
  return agentApi(`/fro/whatsapp/conversations/${conversationId}/messages`, {}, agentToken)
}

export async function sendMessage(conversationId, text, agentToken, mediaUrl, mediaMimeType) {
  return agentApi(`/fro/whatsapp/conversations/${conversationId}/send`, {
    method: 'POST',
    body: JSON.stringify({ text, mediaUrl, mediaMimeType }),
  }, agentToken)
}

export async function sendDirectMessage(phone, text, agentToken, project) {
  return agentApi('/fro/whatsapp/send-direct', {
    method: 'POST',
    body: JSON.stringify({ phone, text, project }),
  }, agentToken)
}

export async function createConversation(phone, agentToken, project) {
  return agentApi('/fro/whatsapp/create-conversation', {
    method: 'POST',
    body: JSON.stringify({ phone, project }),
  }, agentToken)
}

export async function markRead(conversationId, agentToken) {
  return agentApi(`/fro/whatsapp/conversations/${conversationId}/read`, {
    method: 'PUT',
  }, agentToken)
}

export async function searchMessages(query, agentToken) {
  return agentApi(`/fro/whatsapp/search?q=${encodeURIComponent(query)}`, {}, agentToken)
}

export async function getQuickReplies(agentToken) {
  return agentApi('/fro/whatsapp/quick-replies', {}, agentToken)
}

export async function getTemplates(project, agentToken) {
  const qs = project ? `?project=${encodeURIComponent(project)}` : ''
  return agentApi(`/fro/whatsapp/templates${qs}`, {}, agentToken)
}

export async function sendTemplateMessage(conversationId, templateName, paramValues, agentToken, headerMediaUrl, headerMediaName) {
  return agentApi('/fro/whatsapp/send-template', {
    method: 'POST',
    body: JSON.stringify({ conversationId, templateName, paramValues, headerMediaUrl, headerMediaName }),
  }, agentToken)
}

export async function uploadMedia(file, agentToken) {
  const formData = new FormData()
  formData.append('file', file)
  if (agentToken) {
    const res = await fetch(`${API_BASE}/fro/whatsapp/upload-media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${agentToken}` },
      body: formData,
    })
    if (!res.ok) throw new Error('Upload failed')
    return res.json()
  }
  return api('/fro/whatsapp/upload-media', { method: 'POST', body: formData })
}

// Move a thread through open -> pending -> resolved -> closed. The status column
// has always existed on conversations; these routes just make it reachable.
export async function updateConversationStatus(conversationId, status, agentToken) {
  return agentApi(`/fro/whatsapp/conversations/${conversationId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }, agentToken)
}

// Re-send a failed outbound message in place. Only eligible while the row is
// 'failed'; the backend rejects anything else with 409.
export async function retryMessage(conversationId, messageId, agentToken) {
  return agentApi(`/fro/whatsapp/conversations/${conversationId}/messages/${messageId}/retry`, {
    method: 'POST',
  }, agentToken)
}

// Labels are free-text tags kept on conversations.labels (text[]). The endpoint
// and the column both predate this UI; there was simply nothing to write them.
export async function updateLabels(conversationId, labels, agentToken) {
  return agentApi(`/fro/whatsapp/conversations/${conversationId}/labels`, {
    method: 'PUT',
    body: JSON.stringify({ labels }),
  }, agentToken)
}

// Every label in use across the caller's conversations, for the filter list.
export async function getLabels(project, agentToken) {
  const qs = project ? `?project=${encodeURIComponent(project)}` : ''
  return agentApi(`/fro/whatsapp/labels${qs}`, {}, agentToken)
}
