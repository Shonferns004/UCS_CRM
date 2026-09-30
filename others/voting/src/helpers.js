import { now } from './serverClock'

/** Seconds left until an ISO timestamp, from the server-corrected clock. */
export function secondsUntil(iso) {
  if (!iso) return 0
  return Math.max(0, Math.round((new Date(iso).getTime() - now()) / 1000))
}

/** mm:ss, or h:mm:ss once past an hour. */
export function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

export function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// One accent per group, assigned by ceremony position rather than by name, so
// reordering the groups in HR recolours the board consistently.
const ACCENTS = [
  { hue: 42, name: 'gold' },
  { hue: 190, name: 'teal' },
  { hue: 268, name: 'violet' },
  { hue: 12, name: 'coral' },
  { hue: 150, name: 'green' },
  { hue: 215, name: 'blue' },
]

export function accentFor(index = 0) {
  return ACCENTS[Math.abs(index) % ACCENTS.length]
}

/**
 * The intro must play when a ceremony opens and again when each new department's
 * turn opens, but must NOT replay every time someone refreshes mid-vote. Keyed on
 * the turn so a new turn is a new key and therefore a new intro.
 */
const INTRO_KEY = 'voting_intro_seen'

export function introSeenFor(turnId) {
  try {
    return JSON.parse(localStorage.getItem(INTRO_KEY) || '{}')[String(turnId)] === true
  } catch {
    return false
  }
}

export function markIntroSeen(turnId) {
  try {
    const seen = JSON.parse(localStorage.getItem(INTRO_KEY) || '{}')
    seen[String(turnId)] = true
    localStorage.setItem(INTRO_KEY, JSON.stringify(seen))
  } catch {
    /* storage unavailable - the intro will replay, which is harmless */
  }
}
