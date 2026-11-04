// The backend address comes from client/.env: VITE_API_URL=http://localhost:5000/api.
// (A shell variable of the same name overrides the file — that is standard Vite behaviour.)
const configuredApiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

export const API_BASE = configuredApiUrl.endsWith('/api') ? configuredApiUrl : `${configuredApiUrl}/api`
