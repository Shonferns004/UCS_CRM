import { API_BASE, SESSION_KEY } from './config'
import { syncFrom } from './serverClock'

export function setSession(token, user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user: user || null }))
  // The storage event fires in other tabs only, so the AuthProvider listens for
  // this too — it is how the same tab re-renders as signed in.
  window.dispatchEvent(new Event('voting:session'))
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function getToken() {
  return getSession()?.token || ''
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
  window.dispatchEvent(new Event('voting:session'))
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(method, path, body) {
  const token = getToken()
  const sentAt = Date.now()

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const data = await res.json().catch(() => ({}))

  // Every voting response carries server_now; use it to fix the countdown
  // before deciding whether the request succeeded.
  syncFrom(data, { sentAt, receivedAt: Date.now() })

  if (!res.ok) {
    // An expired or cleared session must not leave someone staring at a dead
    // screen mid-ceremony - drop the session so the app shows the login page.
    if (res.status === 401) clearSession()
    throw new ApiError(String(data.message || `Request failed (${res.status})`), res.status)
  }
  return data
}

const get = (path) => request('GET', path)
const post = (path, body) => request('POST', path, body)
const put = (path, body) => request('PUT', path, body)

// ── auth ──────────────────────────────────────────────────────────────────

/**
 * The booth uses the same employee credentials as the rest of the CRM, via the
 * worker login endpoint. `department` on the returned user is not used to decide
 * the voter's group - the server re-derives that from the voting group config, so
 * a stale or absent department on the token cannot misroute a ballot.
 */
export async function login(identifier, password) {
  const data = await request('POST', '/auth/worker/login', { identifier, password })
  const user = data.user || {}
  setSession(data.token, {
    id: user.id,
    name: user.name,
    login_id: user.login_id || identifier,
    department: user.department || null,
    email: user.email || null,
  })
  return user
}

export function logout() {
  clearSession()
}

// ── public ────────────────────────────────────────────────────────────────

/** Whether a ceremony is running. The only call that works before sign-in. */
export const fetchStatus = () => get('/voting/status')

// ── voter ─────────────────────────────────────────────────────────────────

export const fetchCeremony = () => get('/voting/ceremony')
export const fetchBallot = (departmentId) => get(`/voting/ballot?department_id=${encodeURIComponent(departmentId)}`)

/**
 * Cast one department's ballot: one nominee per team, in a single submit.
 *
 * The server re-derives which team each nominee belongs to, so what is sent is
 * just the picks. Its reply deliberately does not echo them, so nothing here can
 * reveal the choices to someone looking over a shoulder.
 */
export const castVote = (departmentId, picks) =>
  post('/voting/ballot', {
    department_id: departmentId,
    picks: picks.map((nomineeId) => ({ nominee_id: nomineeId })),
  })

// ── ceremony control (used by the HR panel; exposed here for the results view) ──

export const fetchBoard = (sessionId) => get(`/voting/sessions/${sessionId}/board`)
export const inspectDepartment = (id) => get(`/voting/departments/${id}`)
export const saveDepartment = (id, patch) => put(`/voting/departments/${id}`, patch)
export const saveDepartmentMembers = (id, body) => put(`/voting/departments/${id}/members`, body)
export const searchWorkers = (q) => get(`/voting/workers?q=${encodeURIComponent(q || '')}`)
export const listSessions = () => get('/voting/sessions')
export const createSession = (body) => post('/voting/sessions', body)
export const startSession = (sessionId, minutes) => post(`/voting/sessions/${sessionId}/start`, { minutes })
export const closeTurn = (sessionId, deptId) => post(`/voting/sessions/${sessionId}/turns/${deptId}/close`)
export const completeSession = (sessionId) => post(`/voting/sessions/${sessionId}/complete`)
