export const API_BASE = 'https://13-207-47-116.sslip.io/api'

// Realtime socket URL (optional; defaults to API_BASE with /api stripped).
// Can be overridden at build time via VITE_SOCKET_URL.
export const SOCKET_URL =
  (import.meta.env && import.meta.env.VITE_SOCKET_URL) || API_BASE.replace(/\/api\/?$/, '')

export const OFFICE_START = '10:00'
export const OFFICE_END = '19:00'

export const CACHE_KEYS = {
  TOKEN: 'ucs_token',
  WORKER: 'ucs_worker',
  TODAY: 'ucs_today',
  HISTORY: 'ucs_history',
  NOTIFICATIONS: 'ucs_notifications',
  UNREAD: 'ucs_unread_count',
  PROFILE: 'ucs_profile',
  LEAVES: 'ucs_leaves',
  LOANS: 'ucs_loans',
  TICKETS: 'ucs_tickets',
  REQUESTS: 'ucs_profile_requests',
}
