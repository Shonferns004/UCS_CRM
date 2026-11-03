// Prefer the configured backend (client/.env), fall back to the dev tunnel the
// rest of the stack uses. Normalize both accepted forms:
// http://localhost:5000 and http://localhost:5000/api.
const configuredApiUrl = (import.meta.env.VITE_API_URL || 'https://audio-diagnoses-ream.ngrok-free.dev/api').replace(/\/+$/, '')
export const API_BASE = configuredApiUrl.endsWith('/api') ? configuredApiUrl : `${configuredApiUrl}/api`;
