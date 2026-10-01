// The booth is served by the same Express app that owns the API
// (backend/src/index.js mounts /audience-voting), so a relative /api base is
// correct in production and needs no configuration — and no CORS preflight,
// which matters because this app has no auth header to preflight with. VITE_API_URL
// only exists for `npm run dev`, where Vite serves the app from a different port
// than the API.
const envApi = import.meta.env.VITE_API_URL;

export const API_BASE = (envApi ? String(envApi) : `${window.location.origin}/api`).replace(/\/+$/, '');

export const ENDPOINT = `${API_BASE}/audience-voting`;

// The server hands this out when someone joins and keeps it in localStorage. It
// identifies the device so one phone cannot rate the same speaker twice; it is
// not an identity and not a credential.
export const DEVICE_KEY = 'audience_voting_device';

// How often the app re-checks who is on stage.
//
// This app polls rather than using socket.io on purpose. The socket handshake
// rejects any connection without a valid JWT (backend/src/socket.js), and this
// booth has no login by design, so the audience structurally cannot join a room.
// 3s is short enough that the room feels live and long enough that a hundred
// phones on venue wifi are not hammering the server.
export const POLL_MS = 3000;