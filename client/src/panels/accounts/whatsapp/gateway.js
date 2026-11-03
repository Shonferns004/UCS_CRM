import { api } from '../../../api/auth'

// Every call goes through the CRM backend's authenticated passthrough:
//   /api/openwa/gateway/<path>  ->  <OPENWA_GATEWAY_URL>/api/<path>
// The backend injects the gateway API key, so it never reaches the browser.
const BASE = '/openwa/gateway'

export function gw(path, options = {}) {
  return api(`${BASE}${path}`, options)
}

export function gwSend(path, method, body) {
  return api(`${BASE}${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

export const gateway = {
  // sessions
  listSessions: () => gw('/sessions'),
  getSession: (id) => gw(`/sessions/${encodeURIComponent(id)}`),
  createSession: (name) => gwSend('/sessions', 'POST', { name }),
  deleteSession: (id) => gwSend(`/sessions/${encodeURIComponent(id)}`, 'DELETE'),
  startSession: (id) => gwSend(`/sessions/${encodeURIComponent(id)}/start`, 'POST', {}),
  stopSession: (id) => gwSend(`/sessions/${encodeURIComponent(id)}/stop`, 'POST', {}),
  logoutSession: (id) => gwSend(`/sessions/${encodeURIComponent(id)}/logout`, 'POST', {}),
  forceKillSession: (id) => gwSend(`/sessions/${encodeURIComponent(id)}/force-kill`, 'POST', {}),
  getQr: (id) => gw(`/sessions/${encodeURIComponent(id)}/qr`),
  requestPairingCode: (id, phoneNumber) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/pairing-code`, 'POST', { phoneNumber }),
  getConfig: (id) => gw(`/sessions/${encodeURIComponent(id)}/config`),
  updateConfig: (id, config) => gwSend(`/sessions/${encodeURIComponent(id)}/config`, 'PATCH', config),

  // chats + messages
  listChats: (id, { limit = 500, offset = 0 } = {}) =>
    gw(`/sessions/${encodeURIComponent(id)}/chats?limit=${limit}&offset=${offset}`),
  listMessages: (id, chatId, { limit = 50, offset = 0 } = {}) =>
    gw(
      `/sessions/${encodeURIComponent(id)}/messages?chatId=${encodeURIComponent(chatId)}&limit=${limit}&offset=${offset}`,
    ),
  sendText: (id, chatId, text) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/messages/send-text`, 'POST', { chatId, text }),
  sendMedia: (id, mediaType, payload) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/messages/send-${mediaType}`, 'POST', payload),
  reply: (id, chatId, quotedMessageId, text) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/messages/reply`, 'POST', { chatId, quotedMessageId, text }),
  react: (id, chatId, messageId, emoji) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/messages/react`, 'POST', { chatId, messageId, emoji }),
  deleteMessage: (id, chatId, messageId, forEveryone = true) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/messages/delete`, 'POST', { chatId, messageId, forEveryone }),
  editMessage: (id, chatId, messageId, text) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/messages/edit`, 'POST', { chatId, messageId, text }),
  starMessage: (id, chatId, messageId, star) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/messages/star`, 'POST', { chatId, messageId, star }),
  messageMedia: (id, chatId, messageId) =>
    gw(
      `/sessions/${encodeURIComponent(id)}/messages/${encodeURIComponent(chatId)}/${encodeURIComponent(messageId)}/media`,
      { raw: true },
    ),

  // chat actions
  markRead: (id, chatId, messageIds) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/chats/read`, 'POST', {
      chatId,
      ...(messageIds?.length ? { messageIds } : {}),
    }),
  markUnread: (id, chatId) => gwSend(`/sessions/${encodeURIComponent(id)}/chats/unread`, 'POST', { chatId }),
  archiveChat: (id, chatId, archive) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/chats/archive`, 'POST', { chatId, archive }),
  pinChat: (id, chatId, pin) => gwSend(`/sessions/${encodeURIComponent(id)}/chats/pin`, 'POST', { chatId, pin }),
  muteChat: (id, chatId, muteUntil) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/chats/mute`, 'POST', { chatId, muteUntil }),
  deleteChat: (id, chatId) => gwSend(`/sessions/${encodeURIComponent(id)}/chats/delete`, 'POST', { chatId }),
  sendChatState: (id, chatId, state) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/chats/typing`, 'POST', { chatId, state }),

  // bulk
  sendBulk: (id, messages, options) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/messages/send-bulk`, 'POST', {
      messages,
      ...(options ? { options } : {}),
    }),
  batchStatus: (id, batchId) =>
    gw(`/sessions/${encodeURIComponent(id)}/messages/batch/${encodeURIComponent(batchId)}`),
  cancelBatch: (id, batchId) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/messages/batch/${encodeURIComponent(batchId)}/cancel`, 'POST', {}),

  // groups
  listGroups: (id) => gw(`/sessions/${encodeURIComponent(id)}/groups`),
  createGroup: (id, payload) => gwSend(`/sessions/${encodeURIComponent(id)}/groups`, 'POST', payload),
  groupInfo: (id, groupId) => gw(`/sessions/${encodeURIComponent(id)}/groups/${encodeURIComponent(groupId)}`),
  groupSettings: (id, groupId) => gw(`/sessions/${encodeURIComponent(id)}/groups/${encodeURIComponent(groupId)}/settings`),
  updateGroupSettings: (id, groupId, payload) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/groups/${encodeURIComponent(groupId)}/settings`, 'PUT', payload),
  updateGroupSubject: (id, groupId, subject) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/groups/${encodeURIComponent(groupId)}/subject`, 'PUT', { subject }),
  updateGroupDescription: (id, groupId, description) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/groups/${encodeURIComponent(groupId)}/description`, 'PUT', {
      description,
    }),
  updateGroupPicture: (id, groupId, payload) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/groups/${encodeURIComponent(groupId)}/picture`, 'PUT', payload),
  addGroupParticipants: (id, groupId, participants) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/groups/${encodeURIComponent(groupId)}/participants`, 'POST', {
      participants,
    }),
  removeGroupParticipants: (id, groupId, participants) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/groups/${encodeURIComponent(groupId)}/participants`, 'DELETE', {
      participants,
    }),
  promoteGroupParticipants: (id, groupId, participants) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/groups/${encodeURIComponent(groupId)}/participants/promote`, 'POST', {
      participants,
    }),
  demoteGroupParticipants: (id, groupId, participants) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/groups/${encodeURIComponent(groupId)}/participants/demote`, 'POST', {
      participants,
    }),
  leaveGroup: (id, groupId) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/groups/${encodeURIComponent(groupId)}/leave`, 'POST', {}),
  groupInviteCode: (id, groupId) =>
    gw(`/sessions/${encodeURIComponent(id)}/groups/${encodeURIComponent(groupId)}/invite-code`),

  // status / stories
  listStatuses: (id) => gw(`/sessions/${encodeURIComponent(id)}/status`),
  statusMedia: (id, statusId) =>
    gw(`/sessions/${encodeURIComponent(id)}/status/${encodeURIComponent(statusId)}/media`, { raw: true }),
  sendTextStatus: (id, payload) => gwSend(`/sessions/${encodeURIComponent(id)}/status/send-text`, 'POST', payload),
  sendImageStatus: (id, payload) => gwSend(`/sessions/${encodeURIComponent(id)}/status/send-image`, 'POST', payload),
  sendVideoStatus: (id, payload) => gwSend(`/sessions/${encodeURIComponent(id)}/status/send-video`, 'POST', payload),
  deleteStatus: (id, statusId) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/status/${encodeURIComponent(statusId)}`, 'DELETE'),

  // plugins
  pluginDetail: (id) => gw(`/plugins/${encodeURIComponent(id)}`),
  pluginHealth: (id) => gw(`/plugins/${encodeURIComponent(id)}/health`),
  updatePluginConfig: (id, config) =>
    gwSend(`/plugins/${encodeURIComponent(id)}/config`, 'PUT', { config }),
  updatePluginSessions: (id, sessions) =>
    gwSend(`/plugins/${encodeURIComponent(id)}/sessions`, 'PUT', { sessions }),
  updatePluginSessionConfig: (id, sessionId, config) =>
    gwSend(`/plugins/${encodeURIComponent(id)}/config/${encodeURIComponent(sessionId)}`, 'PUT', { config }),
  installPlugin: (file) => {
    const form = new FormData()
    form.append('file', file)
    return gw('/plugins/install', { method: 'POST', body: form })
  },
  installPluginFromUrl: (url) => gwSend('/plugins/install-url', 'POST', { url }),
  updatePlugin: (id, url) => gwSend(`/plugins/${encodeURIComponent(id)}/update`, 'POST', { url }),
  deletePlugin: (id) => gwSend(`/plugins/${encodeURIComponent(id)}`, 'DELETE'),

  // stats
  overview: () => gw('/stats/overview'),
  messageStats: (period = '24h') => gw(`/stats/messages?period=${period}`),
  sessionStats: (id) => gw(`/stats/sessions/${encodeURIComponent(id)}`),

  // contacts / number check
  listContacts: (id, { limit = 500, offset = 0 } = {}) =>
    gw(`/sessions/${encodeURIComponent(id)}/contacts?limit=${limit}&offset=${offset}`),
  blockContact: (id, contactId) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/contacts/${encodeURIComponent(contactId)}/block`, 'POST', {}),
  unblockContact: (id, contactId) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/contacts/${encodeURIComponent(contactId)}/block`, 'DELETE'),
  checkNumber: (id, number) =>
    gw(`/sessions/${encodeURIComponent(id)}/contacts/check/${encodeURIComponent(number)}`),

  // templates
  listTemplates: (id) => gw(`/sessions/${encodeURIComponent(id)}/templates`),
  createTemplate: (id, payload) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/templates`, 'POST', payload),
  deleteTemplate: (id, templateId) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/templates/${encodeURIComponent(templateId)}`, 'DELETE'),

  // webhooks
  listWebhooks: (id) => gw(`/sessions/${encodeURIComponent(id)}/webhooks`),
  listAllWebhooks: () => gw('/webhooks'),
  createWebhook: (id, payload) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/webhooks`, 'POST', payload),
  deleteWebhook: (id, webhookId) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/webhooks/${encodeURIComponent(webhookId)}`, 'DELETE'),
  testWebhook: (id, webhookId) =>
    gwSend(`/sessions/${encodeURIComponent(id)}/webhooks/${encodeURIComponent(webhookId)}/test`, 'POST', {}),

  // api keys
  listApiKeys: () => gw('/auth/api-keys'),
  createApiKey: (payload) => gwSend('/auth/api-keys', 'POST', payload),
  revokeApiKey: (id) => gwSend(`/auth/api-keys/${encodeURIComponent(id)}/revoke`, 'POST', {}),
  deleteApiKey: (id) => gwSend(`/auth/api-keys/${encodeURIComponent(id)}`, 'DELETE'),

  // audit
  listAudit: ({ limit = 100, offset = 0, severity, action } = {}) => {
    const q = new URLSearchParams()
    q.set('limit', String(limit))
    q.set('offset', String(offset))
    if (severity) q.set('severity', severity)
    if (action) q.set('action', action)
    return gw(`/audit?${q.toString()}`)
  },

  // plugins + infrastructure
  listPlugins: () => gw('/plugins'),
  enablePlugin: (id) => gwSend(`/plugins/${encodeURIComponent(id)}/enable`, 'POST', {}),
  disablePlugin: (id) => gwSend(`/plugins/${encodeURIComponent(id)}/disable`, 'POST', {}),
  infraStatus: () => gw('/infra/status'),
  health: () => gw('/health'),
  healthReady: () => gw('/health/ready'),
  updateCheck: () => gw('/infra/update-check'),
}
