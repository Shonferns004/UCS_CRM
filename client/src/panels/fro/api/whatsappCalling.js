/**
 * WhatsApp calling API client.
 *
 * SDP is only ever exchanged with the backend; audio flows peer-to-peer in the
 * browser, so nothing here touches media.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

function token() {
  try {
    return localStorage.getItem('ucs_token') || localStorage.getItem('ucs_whatsapp_agent_token')
  } catch {
    return null
  }
}

async function callApi(path, { method = 'GET', body, agentToken } = {}) {
  const t = agentToken || token()
  const res = await fetch(`${API_BASE}/whatsapp/calling${path}`, {
    method,
    headers: {
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      'ngrok-skip-browser-warning': 'true',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  let payload = null
  try {
    payload = await res.json()
  } catch {
    payload = null
  }
  if (!res.ok) {
    const error = new Error(payload?.message || `Request failed (${res.status})`)
    error.status = res.status
    error.payload = payload
    throw error
  }
  return payload
}

export const getCallingStatus = (conversationId, agentToken) =>
  callApi('/status', { method: 'POST', body: { conversationId }, agentToken })

export const requestCallPermission = (conversationId, agentToken) =>
  callApi('/request-permission', { method: 'POST', body: { conversationId }, agentToken })

export const startCall = (conversationId, sdpOffer, agentToken) =>
  callApi('/start', { method: 'POST', body: { conversationId, sdpOffer }, agentToken })

export const answerCall = (callId, sdpAnswer, agentToken) =>
  callApi(`/${callId}/answer`, { method: 'POST', body: { sdpAnswer }, agentToken })

export const declineCall = (callId, agentToken) =>
  callApi(`/${callId}/decline`, { method: 'POST', agentToken })

export const endCall = (callId, reason, agentToken) =>
  callApi(`/${callId}/end`, { method: 'POST', body: { reason }, agentToken })

export const getActiveCalls = (project, agentToken) => {
  // project is optional -- the inbox polls this to notice an incoming call, and
  // the agent may be on the "all" tab with no project in the URL.
  const q = project && project !== 'all' ? `?project=${encodeURIComponent(project)}` : ''
  return callApi(`/active${q}`, { agentToken })
}

export const getCallHistory = ({ project, conversationId, limit = 50 }, agentToken) => {
  const q = new URLSearchParams({ project })
  if (conversationId) q.set('conversationId', conversationId)
  if (limit) q.set('limit', String(limit))
  return callApi(`/history?${q}`, { agentToken })
}
