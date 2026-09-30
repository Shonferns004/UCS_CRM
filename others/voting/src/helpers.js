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
 * The reference gives each named department its own colour, so a department
 * keeps the same accent wherever it appears (grid, ballot, confirmation) no
 * matter where HR has ordered it. Falls back to the positional accent above for
 * any department not listed, so a newly added group still gets a colour.
 *
 * Only presentation is keyed by name - who may vote, and on which roster, is
 * decided by the server and is never touched here.
 */
const DEPARTMENT_ACCENTS = {
  FRO: { base: '#c78e1e', soft: '#fff6df', edge: '#f0d79a' },
  Digital: { base: '#0e8fa8', soft: '#e6f6f9', edge: '#a8dde8' },
  Developers: { base: '#6d4bc4', soft: '#f1ecfd', edge: '#cbb9f0' },
  HR: { base: '#c2453f', soft: '#fdecea', edge: '#f2bdb8' },
  Admin: { base: '#16845b', soft: '#e9f7f0', edge: '#a9dcc5' },
  Housekeeping: { base: '#2b62c4', soft: '#eaf1fd', edge: '#b3c9ee' },
}

const FALLBACK_ACCENTS = [
  { base: '#c78e1e', soft: '#fff6df', edge: '#f0d79a' },
  { base: '#0e8fa8', soft: '#e6f6f9', edge: '#a8dde8' },
  { base: '#6d4bc4', soft: '#f1ecfd', edge: '#cbb9f0' },
  { base: '#c2453f', soft: '#fdecea', edge: '#f2bdb8' },
  { base: '#16845b', soft: '#e9f7f0', edge: '#a9dcc5' },
  { base: '#2b62c4', soft: '#eaf1fd', edge: '#b3c9ee' },
]

export function departmentAccent(department) {
  const named = department && DEPARTMENT_ACCENTS[department.name]
  if (named) return named
  return FALLBACK_ACCENTS[Math.abs(department?.order_index ?? 0) % FALLBACK_ACCENTS.length]
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

/**
 * Mark one department voted in a ceremony payload, locally and immediately.
 *
 * The server never echoes the nominee back, so this cannot leak a choice. It
 * exists because the confirmation screen and the "next department" choice are
 * both derived from `departments`: without it, a slow or failed refresh after a
 * vote could leave the progress bar still counting the department just finished,
 * and could offer that same ballot as the next thing to do. The next refresh
 * replaces this with the server's truth either way.
 */
export function withDepartmentVoted(ceremony, departmentId) {
  if (!ceremony) return ceremony
  return {
    ...ceremony,
    departments: ceremony.departments.map((d) =>
      d.id === departmentId ? { ...d, voted: true } : d,
    ),
  }
}

/** The next department to offer: first still-open one nobody has voted in yet. */
export function nextDepartment(departments) {
  return departments.find((d) => !d.voted && d.open) || null
}

/** True once every department on the ballot has a vote from this person. */
export function allDepartmentsVoted(departments) {
  return departments.length > 0 && departments.every((d) => d.voted)
}
