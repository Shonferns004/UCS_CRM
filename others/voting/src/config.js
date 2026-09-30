// The booth is served by the same Express app that owns the API
// (backend/src/index.js mounts /voting), so a relative /api base is correct in
// production and needs no configuration. VITE_API_URL only exists for `npm run
// dev`, where Vite serves the app from a different port than the API.
const envApi = import.meta.env.VITE_API_URL;

export const API_BASE = (envApi ? String(envApi) : `${window.location.origin}/api`).replace(/\/+$/, '');

export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || API_BASE.replace(/\/api\/?$/, '');

// Every authenticated socket joins this room; the server pushes turn changes to
// it. Kept in one place so the room name cannot drift from the backend.
export const VOTING_ROOM = 'voting';

export const SESSION_KEY = 'voting_session';
