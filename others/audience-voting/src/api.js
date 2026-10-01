import { ENDPOINT, DEVICE_KEY } from './config'

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message)
    this.status = status
    // Machine-readable reason. Three different refusals from /rate share the 409
    // status but need different screens — one is a success as far as the rater is
    // concerned — so the app branches on this, never on the status alone.
    this.code = code
  }
}

export function getDeviceToken() {
  try {
    return localStorage.getItem(DEVICE_KEY) || ''
  } catch {
    // Private browsing on some browsers throws on localStorage access. The booth
    // still works, it just cannot remember the device between reloads.
    return ''
  }
}

export function setDeviceToken(token) {
  try {
    if (token) localStorage.setItem(DEVICE_KEY, token)
  } catch {
    /* see getDeviceToken */
  }
}

/**
 * Forget this device.
 *
 * Only used when the server says the token means nothing to it — otherwise a
 * stored token is exactly what stops somebody rating the same speaker twice, and
 * throwing it away re-opens that door.
 */
export function clearDeviceToken() {
  try {
    localStorage.removeItem(DEVICE_KEY)
  } catch {
    /* see getDeviceToken */
  }
}

async function request(method, path, body, query) {
  const url = new URL(`${ENDPOINT}${path}`, window.location.origin)
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString(), {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new ApiError(String(data.message || `Request failed (${res.status})`), res.status, data.code)
  }
  return data
}

const get = (path, query) => request('GET', path, null, query)
const post = (path, body) => request('POST', path, body)

/**
 * Is an event live, whose turn is it, and has this device already rated them?
 *
 * `live: false` is a normal 200 answer, not an error — the app spends most of its
 * life in that state, between speakers and before the event opens.
 */
export const fetchStatus = () => get('/status', { device_token: getDeviceToken() })

/** Register a display name for this device. Idempotent per device. */
export const join = (name) => post('/join', { name, device_token: getDeviceToken() || undefined })

/**
 * Submit scores for whoever is on stage.
 *
 * participant_id is sent so the server can refuse a rating aimed at a speaker who
 * has already been replaced, rather than silently re-targeting it at whoever
 * walked on next.
 */
export const submitRating = (payload) =>
  post('/rate', {
    device_token: getDeviceToken(),
    participant_id: payload.participantId,
    delivery: payload.delivery,
    confidence: payload.confidence,
    clarity: payload.clarity,
    relevance: payload.relevance,
    timing: payload.timing,
    comment: payload.comment || undefined,
  })