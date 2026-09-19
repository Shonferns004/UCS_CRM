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

export async function getConversations(userId, agentToken, project) {
  const qs = project ? `?project=${encodeURIComponent(project)}` : ''
  return agentApi(`/fro/whatsapp/agent-conversations${qs}`, {}, agentToken)
}

export async function getUnreadCount(userId, agentToken) {
  return agentApi('/fro/whatsapp/agent-conversations/unread-count', {}, agentToken)
}

export async function getMessages(conversationId, agentToken) {
  return agentApi(`/fro/whatsapp/conversations/${conversationId}/messages`, {}, agentToken)
}

export async function sendMessage(conversationId, text, agentToken, mediaUrl) {
  return agentApi(`/fro/whatsapp/conversations/${conversationId}/send`, {
    method: 'POST',
    body: JSON.stringify({ text, mediaUrl }),
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
