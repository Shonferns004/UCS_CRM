import { api } from './auth'

export async function getConversations(userId) {
  const data = await api('/fro/whatsapp/conversations')
  return data || []
}

export async function getUnreadCount(userId) {
  const { count } = await api('/fro/whatsapp/conversations/unread-count')
  return count || 0
}

export async function getMessages(conversationId) {
  const data = await api(`/fro/whatsapp/conversations/${conversationId}/messages`)
  return data || []
}

export async function markRead(conversationId) {
  await api(`/fro/whatsapp/conversations/${conversationId}/read`, { method: 'PUT' })
}

export async function sendMessage(conversationId, contactId, messageText, userId, mediaUrl, mediaType, mediaFile) {
  let url = mediaUrl || null
  if (mediaFile && !url) {
    const upload = await uploadMedia(userId, mediaFile)
    url = upload?.url || null
  }
  const result = await api(`/fro/whatsapp/conversations/${conversationId}/send`, {
    method: 'POST',
    body: JSON.stringify({ text: messageText || '', mediaUrl: url }),
  })
  return result?.message || { id: null }
}

export async function sendDirectMessage(userId, phone, messageText, project) {
  return api('/fro/whatsapp/send-direct', {
    method: 'POST',
    body: JSON.stringify({ phone, text: messageText, project: project || undefined }),
  })
}

export async function getQuickReplies() {
  const data = await api('/fro/whatsapp/quick-replies')
  return data || []
}

export async function getTemplates(project) {
  const qs = project ? `?project=${encodeURIComponent(project)}` : ''
  const data = await api(`/fro/whatsapp/templates${qs}`)
  return data || []
}

export async function sendTemplateMessage(conversationId, contactId, template, paramValues, userId) {
  const result = await api('/fro/whatsapp/send-template', {
    method: 'POST',
    body: JSON.stringify({
      conversationId,
      templateName: template.name,
      paramValues: Array.isArray(paramValues) ? paramValues : Object.values(paramValues || {}),
    }),
  })
  return result?.success === true
}

export async function searchMessages(userId, query) {
  const data = await api(`/fro/whatsapp/search?q=${encodeURIComponent(query)}`)
  return data || []
}

export async function updateLabels(conversationId, labels) {
  await api(`/fro/whatsapp/conversations/${conversationId}/labels`, {
    method: 'PUT',
    body: JSON.stringify({ labels }),
  })
}

export async function uploadMedia(userId, file) {
  const formData = new FormData()
  formData.append('file', file)
  try {
    const res = await fetch((import.meta.env.VITE_API_URL || 'https://ucs-crm-backend.vercel.app/api') + '/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('ucs_token') || ''}` },
      body: formData,
    })
    if (res.ok) return res.json()
  } catch (e) { console.error('Error:', e.message); }
  return api('/fro/whatsapp/upload-media', { method: 'POST', body: formData })
}
