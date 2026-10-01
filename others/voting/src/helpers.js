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

/**
 * Group nominees by worker team — the ballot is drawn one section per team,
 * because the pick is per team.
 *
 * Mirrors the server's grouping so the booth reads the same way even if it is
 * handed a flat nominee list. The key is only used locally, to hold a selection
 * per team; the server re-derives the team when the ballot is cast.
 *
 * Nominees with no team are left off, matching the server: a "No team" section
 * is a team nobody is on, so it can only hand someone a prize nobody chose them
 * for. A roster with no teams at all still gets one group, so such a department
 * remains votable instead of silently losing its whole ballot.
 */
export function groupByTeam(nominees, { fallbackLabel = '' } = {}) {
  const byKey = new Map()
  for (const n of nominees || []) {
    const label = String(n?.team ?? '').trim()
    const key = label.toLowerCase()
    if (!key) continue
    if (!byKey.has(key)) byKey.set(key, { key, label, nominees: [] })
    byKey.get(key).nominees.push(n)
  }
  const groups = [...byKey.values()]
  if (!groups.length && nominees?.length) {
    groups.push({ key: '', label: String(fallbackLabel || '').trim(), nominees: [...nominees] })
  }
  return groups.sort((a, b) => {
    if (a.key === b.key) return 0
    if (!a.key) return 1
    if (!b.key) return -1
    // Numeric-aware so UFS2 sorts before UFS10.
    return a.label.localeCompare(b.label, 'en', { numeric: true, sensitivity: 'base' })
  })
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
 * Five values per department:
 *   base  - the bright accent: card top edge, icon and icon tile tint source
 *   soft  - the pale tile background behind the icon
 *   edge  - the card's border while it is still open for voting
 *   ink   - the dark accent, for accent-coloured text on a light background
 *   cta   - the button fill, always dark enough for white text (>= 4.5:1)
 *
 * `cta` exists because `base` is deliberately bright: the light accents (gold,
 * digital blue, housekeeping blue) cannot carry white button text without
 * dropping under 4.5:1, so the button uses a deeper shade of the same hue
 * instead. Five of the six simply reuse `ink`; only gold needs its own, since
 * its ink (#9A6100) is still too light for white text.
 *
 * Only presentation is keyed by name - who may vote, and on which roster, is
 * decided by the server and is never touched here.
 */
const DEPARTMENT_ACCENTS = {
  FRO: { base: '#e59a00', soft: '#fff4d8', edge: '#f7d98c', ink: '#9a6100', cta: '#96620a' },
  Digital: { base: '#078edb', soft: '#e8f7ff', edge: '#b9e5ff', ink: '#0877b8', cta: '#0a6fa8' },
  Developers: { base: '#6d35e8', soft: '#f1eafe', edge: '#d9c8ff', ink: '#5b2bc5', cta: '#5b2bc5' },
  HR: { base: '#f04452', soft: '#fff0f1', edge: '#ffd0d4', ink: '#c82e3b', cta: '#c82e3b' },
  Admin: { base: '#07966b', soft: '#e8faf3', edge: '#b9ebd8', ink: '#087b59', cta: '#087b59' },
  Housekeeping: { base: '#1875e8', soft: '#eaf3ff', edge: '#c4dcff', ink: '#155bb8', cta: '#155bb8' },
}

/* Same six sets, so an unlisted department still gets a legible, accessible
   button rather than a bright accent it cannot put white text on. */
const FALLBACK_ACCENTS = [
  { base: '#e59a00', soft: '#fff4d8', edge: '#f7d98c', ink: '#9a6100', cta: '#96620a' },
  { base: '#078edb', soft: '#e8f7ff', edge: '#b9e5ff', ink: '#0877b8', cta: '#0a6fa8' },
  { base: '#6d35e8', soft: '#f1eafe', edge: '#d9c8ff', ink: '#5b2bc5', cta: '#5b2bc5' },
  { base: '#f04452', soft: '#fff0f1', edge: '#ffd0d4', ink: '#c82e3b', cta: '#c82e3b' },
  { base: '#07966b', soft: '#e8faf3', edge: '#b9ebd8', ink: '#087b59', cta: '#087b59' },
  { base: '#1875e8', soft: '#eaf3ff', edge: '#c4dcff', ink: '#155bb8', cta: '#155bb8' },
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
