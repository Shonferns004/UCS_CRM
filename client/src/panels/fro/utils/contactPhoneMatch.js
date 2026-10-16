// Does a donor phone already have a WhatsApp thread on any number this agent
// holds, and if so which one?
//
// This started as an inline find() inside WhatsAppInbox's deep-link effect, and
// it was wrong in a way that was hard to see: it searched only the conversation
// list for the ACTIVE TAB. Being Sevak is live as two numbers (`bsct` and
// `bsct2`) and FROs are split across them, so a donor whose thread sat on the
// agent's other number looked brand new. Clicking "New Conversation" then
// started a SECOND thread for a number the agent already had.
//
// Pulled out and pure so it can be tested without a DOM: the whole behaviour is
// a list scan and a phone comparison, and both are easy to get subtly wrong.

const digitsOnly = (v) => String(v ?? '').replace(/\D/g, '')

/**
 * Compare a stored contact number with a number typed into a deep link.
 *
 * Stored numbers keep their country code (919819155594) while a deep link may
 * carry 9819155594 or +91 98191 55594, so an exact string compare misses and a
 * plain endsWith can match the wrong donor when the stored value is a suffix of
 * something else. Compare on the last 10 digits, which is what actually
 * distinguishes Indian mobile numbers here.
 */
export function samePhone(a, b) {
  const x = digitsOnly(a)
  const y = digitsOnly(b)
  if (!x || !y) return false
  const sx = x.slice(-10)
  const sy = y.slice(-10)
  return sx === sy
}

/**
 * Find the open thread for `phone` in `conversations`, preferring one whose
 * project matches `preferredProject`.
 *
 * `conversations` should be every thread the agent can see, not just the active
 * tab's slice -- that restriction is what caused the duplicate thread in the
 * first place.
 */
export function findExistingThread(conversations, phone, preferredProject) {
  const pool = Array.isArray(conversations) ? conversations : []
  if (!digitsOnly(phone)) return null

  const match = (c) => {
    const contact = c?.contact || {}
    return samePhone(contact.phone_normalized || contact.phone || '', phone)
  }

  const hits = pool.filter(match)
  if (hits.length === 0) return null
  if (preferredProject) {
    const preferred = hits.find((c) => c.project === preferredProject)
    if (preferred) return preferred
  }
  return hits[0]
}