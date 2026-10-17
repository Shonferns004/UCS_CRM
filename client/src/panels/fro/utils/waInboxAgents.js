// The FRO sidebar's WhatsApp inbox links are derived from the agent sessions
// returned by /fro/whatsapp/auto-login. They were cached under a single
// device-global `wa_agents` key, which leaked another FRO's inboxes into the
// sidebar after an impersonation ("work as") switch or on a shared terminal —
// e.g. a freshly-added FRO seeing the previous user's BSCT/MANN inboxes. Scope
// the cache to the logged-in user so each identity only sees its own inboxes.
const PREFIX = 'wa_agents'

function currentUserId() {
  try {
    const raw = localStorage.getItem('ucs_user')
    const id = raw ? JSON.parse(raw)?.id : null
    return id != null ? String(id) : null
  } catch { return null }
}

export function waInboxAgentsKey(userId = currentUserId()) {
  return userId ? `${PREFIX}_${userId}` : `${PREFIX}_anon`
}

export function readWaInboxAgents(userId) {
  try {
    // Drop the legacy unscoped key so an old session can't resurface.
    localStorage.removeItem(PREFIX)
    const raw = localStorage.getItem(waInboxAgentsKey(userId))
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function writeWaInboxAgents(agents, userId) {
  try { localStorage.setItem(waInboxAgentsKey(userId), JSON.stringify(agents || [])) } catch { /* ignore quota */ }
}

export function clearWaInboxAgents(userId) {
  try { localStorage.removeItem(waInboxAgentsKey(userId)) } catch { /* ignore */ }
}
