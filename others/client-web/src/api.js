import { API_BASE, CACHE_KEYS } from './config'

const getToken = () => localStorage.getItem(CACHE_KEYS.TOKEN)

export const cache = {
  get(key) {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage full / unavailable */
    }
  },
  clear(key) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* noop */
    }
  },
}

function istDateStr() {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

async function request(method, path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Request failed')
  return data
}

export const api = {
  login: (identifier, password) =>
    request('POST', 'auth/worker/login', { identifier, password }),

  punchIn: async (code, latitude, longitude, dailyCode) => {
    const data = await request('POST', 'attendance/punch-in', dailyCode
      ? { daily_code: dailyCode, latitude, longitude }
      : { code, latitude, longitude })
    cache.clear(CACHE_KEYS.TODAY)
    cache.clear(CACHE_KEYS.HISTORY)
    return data
  },

  punchOut: async (latitude, longitude) => {
    const data = await request('POST', 'attendance/punch-out', { latitude, longitude })
    cache.clear(CACHE_KEYS.TODAY)
    cache.clear(CACHE_KEYS.HISTORY)
    return data
  },

  today: async () => {
    const data = await request('GET', 'attendance/today')
    cache.set(CACHE_KEYS.TODAY, { date: istDateStr(), ...data })
    return data
  },

  getCachedToday: () => {
    const c = cache.get(CACHE_KEYS.TODAY)
    if (!c || c.date !== istDateStr()) return null
    return c
  },

  history: async () => {
    const data = await request('GET', 'attendance/history')
    cache.set(CACHE_KEYS.HISTORY, Array.isArray(data) ? data : data?.history || [])
    return data
  },

  getCachedHistory: () => {
    const c = cache.get(CACHE_KEYS.HISTORY)
    return Array.isArray(c) ? c : []
  },

  myProfile: async () => {
    const data = await request('GET', 'workers/me')
    cache.set(CACHE_KEYS.PROFILE, data)
    return data
  },

  getCachedProfile: () => cache.get(CACHE_KEYS.PROFILE),

  updateProfile: async (body) => {
    const data = await request('PUT', 'workers/me', body)
    cache.clear(CACHE_KEYS.PROFILE)
    return data
  },

  applyLeave: async (body) => {
    const data = await request('POST', 'leaves/apply', body)
    cache.clear(CACHE_KEYS.LEAVES)
    return data
  },

  myLeaves: async () => {
    const data = await request('GET', 'leaves/my')
    cache.set(CACHE_KEYS.LEAVES, Array.isArray(data) ? data : data?.leaves || [])
    return data
  },

  getCachedLeaves: () => {
    const c = cache.get(CACHE_KEYS.LEAVES)
    return Array.isArray(c) ? c : []
  },

  applyAdvance: async (body) => {
    const data = await request('POST', 'advances/apply', body)
    cache.clear(CACHE_KEYS.LOANS)
    return data
  },

  applyLoan: async (body) => {
    const data = await request('POST', 'loans/apply', body)
    cache.clear(CACHE_KEYS.LOANS)
    return data
  },

  myLoans: async () => {
    const data = await request('GET', 'loans/my')
    cache.set(CACHE_KEYS.LOANS, Array.isArray(data) ? data : data?.loans || [])
    return data
  },

  getCachedLoans: () => {
    const c = cache.get(CACHE_KEYS.LOANS)
    return Array.isArray(c) ? c : []
  },

  myTickets: async () => {
    const data = await request('GET', 'attendance-corrections/my')
    cache.set(CACHE_KEYS.TICKETS, Array.isArray(data) ? data : data?.tickets || [])
    return data
  },

  getCachedTickets: () => {
    const c = cache.get(CACHE_KEYS.TICKETS)
    return Array.isArray(c) ? c : []
  },

  raiseTicket: async (body) => {
    const data = await request('POST', 'attendance-corrections', body)
    cache.clear(CACHE_KEYS.TICKETS)
    return data
  },

  notifications: async (workerId) => {
    const data = await request('GET', `notifications/${workerId}`)
    cache.set(CACHE_KEYS.NOTIFICATIONS, Array.isArray(data) ? data : [])
    return data
  },

  getCachedNotifications: () => {
    const c = cache.get(CACHE_KEYS.NOTIFICATIONS)
    return Array.isArray(c) ? c : []
  },

  unreadCount: async (workerId) => {
    const data = await request('GET', `notifications/${workerId}/unread-count`)
    cache.set(CACHE_KEYS.UNREAD, data?.count || 0)
    return data
  },

  getCachedUnreadCount: () => {
    const c = cache.get(CACHE_KEYS.UNREAD)
    return typeof c === 'number' ? c : 0
  },

  markRead: async (id) => {
    const data = await request('PUT', `notifications/${id}/read`)
    cache.clear(CACHE_KEYS.NOTIFICATIONS)
    cache.clear(CACHE_KEYS.UNREAD)
    return data
  },

  onboardingStatus: () => request('GET', 'onboarding/status'),

  submitOnboarding: (body) => request('POST', 'onboarding/submit', body),

  uploadPhoto: (photoBase64, mimeType) =>
    request('POST', 'onboarding/upload-photo', { photo_base64: photoBase64, mime_type: mimeType }),

  uploadDocument: (documentType, fileBase64, mimeType) =>
    request('POST', 'onboarding/upload-document', { document_type: documentType, file_base64: fileBase64, mime_type: mimeType }),

  deleteNotification: async (id) => {
    const data = await request('DELETE', `notifications/${id}`)
    cache.clear(CACHE_KEYS.NOTIFICATIONS)
    cache.clear(CACHE_KEYS.UNREAD)
    return data
  },

  submitProfileUpdateRequest: async (changes) => {
    const data = await request('POST', 'profile-update-requests', { changes })
    cache.clear(CACHE_KEYS.REQUESTS)
    return data
  },

  myProfileUpdateRequests: async () => {
    const data = await request('GET', 'profile-update-requests/my')
    cache.set(CACHE_KEYS.REQUESTS, Array.isArray(data) ? data : data?.requests || [])
    return data
  },

  getCachedRequests: () => {
    const c = cache.get(CACHE_KEYS.REQUESTS)
    return Array.isArray(c) ? c : []
  },

  salaryBreakdown: () => request('GET', 'salary/my-breakdown'),

  notices: () => request('GET', 'notices'),
  holidays: () => request('GET', 'holidays'),

  calendar: () => request('GET', 'calendar'),

  policies: () => request('GET', 'onboarding/policies'),
}
