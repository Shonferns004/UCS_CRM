import { api } from './auth'

export async function getConversations() {
  return api('/fro/whatsapp/conversations')
}

export async function getUnreadCount() {
  return api('/fro/whatsapp/conversations/unread-count')
}

export async function getMessages(conversationId) {
  return api(`/fro/whatsapp/conversations/${conversationId}/messages`)
}

export async function sendMessage(conversationId, text) {
  return api(`/fro/whatsapp/conversations/${conversationId}/send`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export async function sendDirectMessage(phone, text) {
  return api('/fro/whatsapp/send-direct', {
    method: 'POST',
    body: JSON.stringify({ phone, text }),
  })
}

export async function markRead(conversationId) {
  return api(`/fro/whatsapp/conversations/${conversationId}/read`, {
    method: 'PUT',
  })
}

export async function getQuickReplies() {
  return api('/fro/whatsapp/quick-replies')
}

export async function getTemplates(project) {
  const qs = project ? `?project=${encodeURIComponent(project)}` : ''
  return api(`/fro/whatsapp/templates${qs}`)
}

export async function sendTemplateMessage(conversationId, templateName, paramValues) {
  return api('/fro/whatsapp/send-template', {
    method: 'POST',
    body: JSON.stringify({ conversationId, templateName, paramValues }),
  })
}

export async function searchMessages(query) {
  return api(`/fro/whatsapp/search?q=${encodeURIComponent(query)}`)
}

export async function updateLabels(conversationId, labels) {
  return api(`/fro/whatsapp/conversations/${conversationId}/labels`, {
    method: 'PUT',
    body: JSON.stringify({ labels }),
  })
}

export async function uploadMedia(file) {
  const formData = new FormData()
  formData.append('file', file)
  return api('/fro/whatsapp/upload-media', {
    method: 'POST',
    body: formData,
  })
}

export async function sendMediaMessage(conversationId, mediaUrl, caption) {
  return api(`/fro/whatsapp/conversations/${conversationId}/send`, {
    method: 'POST',
    body: JSON.stringify({ text: caption || '', mediaUrl }),
  })
}
