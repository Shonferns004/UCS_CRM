// Single source of truth for the backend origin. Every fetch and the socket.io
// connection derive from here, so a misconfigured URL is one edit, not a hunt.
//
// WHY THIS VALIDATES INSTEAD OF TRUSTING import.meta.env. VITE_API_URL comes
// from client/.env, which is gitignored and therefore absent on a fresh clone.
// `import.meta.env.VITE_API_URL` is then `undefined`, and every consumer read it
// as a plain string: fetch() built the literal URL "undefined/auth/login" and
// socket.js called API_BASE.replace(...) on undefined. Both surfaced as
//   TypeError: Cannot read properties of undefined (reading 'replace')
// caught by the App-level ErrorBoundary, which printed "Something went wrong" on
// the LOGIN screen — three layers away from the real cause (a missing env var),
// and impossible to act on. A missing optional variable must degrade the feature
// it belongs to, and must name itself.
//
// The default below is only a last resort so a dev with no .env at all still
// reaches *something*. It points at the production API, so set VITE_API_URL
// explicitly rather than relying on it.
const DEFAULT_API_BASE = 'https://api.beingsevak.org/api'

const raw = import.meta.env.VITE_API_URL

export const API_BASE = (typeof raw === 'string' ? raw.trim() : '') || DEFAULT_API_BASE

export const API_BASE_CONFIGURED = Boolean(typeof raw === 'string' && raw.trim())

if (!API_BASE_CONFIGURED) {
  console.error(
    `[config] VITE_API_URL is not set in client/.env — falling back to ${DEFAULT_API_BASE}. ` +
    'Copy client/.env.example to client/.env and set VITE_API_URL to your backend, then restart the dev server.',
  )
}

/**
 * The socket origin: API_BASE with the trailing /api stripped, or
 * VITE_SOCKET_URL when set. Safe to call with API_BASE undefined or non-string.
 */
export function socketBaseUrl() {
  const override = import.meta.env.VITE_SOCKET_URL
  if (typeof override === 'string' && override.trim()) return override.trim()
  return String(API_BASE ?? '').replace(/\/api\/?$/, '')
}
