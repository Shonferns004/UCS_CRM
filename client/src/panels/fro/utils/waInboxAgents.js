// The FRO sidebar's WhatsApp inbox links are derived from the agent sessions
// returned by /fro/whatsapp/auto-login. They were cached under a single
// device-global `wa_agents` key, which leaked another FRO's inboxes into the
// sidebar after an impersonation ("work as") switch or on a shared terminal —
// e.g. a freshly-added FRO seeing the previous user's BSCT/MANN inboxes. Scope
// the cache to the logged-in user so each identity only sees its own inboxes.
const PREFIX = 'wa_agents'
// v2: station-scoped FROs must not keep a cached plain bsct/aflf/mann link
// after the "2-only" rule. Bumping the version drops every pre-rule cache once.
const VERSION = 'v2'

function currentUserId() {
  try {
    const raw = localStorage.getItem('ucs_user')
    const id = raw ? JSON.parse(raw)?.id : null
    return id != null ? String(id) : null
  } catch { return null }
}

export function waInboxAgentsKey(userId = currentUserId()) {
  return userId ? `${PREFIX}_${VERSION}_${userId}` : `${PREFIX}_${VERSION}_anon`
}

export function readWaInboxAgents(userId) {
  try {
    const uid = userId ?? currentUserId()
    // Drop the legacy unscoped key and the pre-v2 scoped key so an old session
    // can't resurface a plain bsct/aflf/mann inbox.
    localStorage.removeItem(PREFIX)
    localStorage.removeItem(uid ? `${PREFIX}_${uid}` : `${PREFIX}_anon`)
    const raw = localStorage.getItem(waInboxAgentsKey(uid))
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function writeWaInboxAgents(agents, userId) {
  try { localStorage.setItem(waInboxAgentsKey(userId), JSON.stringify(agents || [])) } catch { /* ignore quota */ }
}

export function clearWaInboxAgents(userId) {
  try { localStorage.removeItem(waInboxAgentsKey(userId)) } catch { /* ignore */ }
}
