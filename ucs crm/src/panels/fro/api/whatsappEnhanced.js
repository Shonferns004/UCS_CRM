import { api } from './auth'

function agentApi(path, options = {}, agentToken) {
  if (agentToken) {
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${agentToken}` }
    const base = import.meta.env.VITE_API_URL || 'https://ucs-crm-backend.vercel.app/api'
    return fetch(`${base}${path}`, { ...options, headers }).then(async r => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText)
      return r.json()
    })
  }
  return api(path, options)
}

export async function getConversations(userId, agentToken) {
  return agentApi('/fro/whatsapp/agent-conversations', {}, agentToken)
}

export async function getUnreadCount(userId, agentToken) {
  return agentApi('/fro/whatsapp/agent-conversations/unread-count', {}, agentToken)
}

export async function getMessages(conversationId, agentToken) {
  return agentApi(`/fro/whatsapp/conversations/${conversationId}/messages`, {}, agentToken)
}

export async function sendMessage(conversationId, text, agentToken) {
  return agentApi(`/fro/whatsapp/conversations/${conversationId}/send`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  }, agentToken)
}

export async function sendDirectMessage(phone, text, agentToken) {
  return agentApi('/fro/whatsapp/send-direct', {
    method: 'POST',
    body: JSON.stringify({ phone, text }),
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

export async function sendTemplateMessage(conversationId, templateName, paramValues, agentToken) {
  return agentApi('/fro/whatsapp/send-template', {
    method: 'POST',
    body: JSON.stringify({ conversationId, templateName, paramValues }),
  }, agentToken)
}

export async function uploadMedia(file, agentToken) {
  const formData = new FormData()
  formData.append('file', file)
  if (agentToken) {
    const base = import.meta.env.VITE_API_URL || 'https://ucs-crm-backend.vercel.app/api'
    const res = await fetch(`${base}/fro/whatsapp/upload-media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${agentToken}` },
      body: formData,
    })
    if (!res.ok) throw new Error('Upload failed')
    return res.json()
  }
  return api('/fro/whatsapp/upload-media', { method: 'POST', body: formData })
}
