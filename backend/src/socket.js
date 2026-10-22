// Facade over the realtime transport selected by REALTIME_TRANSPORT.
//
// Default is uWebSockets.js. Set REALTIME_TRANSPORT=socketio to use the legacy
// Socket.IO implementation (kept for rollback / A-B comparison).
import * as socketioImpl from './realtime/socketio.legacy.js';

// uWebSockets is the default realtime transport, but it is an optional native
// dependency (it ships prebuilt binaries for Node 18/20/22/24/26). Load it
// lazily so a missing or incompatible build cannot take the whole backend down:
// if it fails to load we fall back to the Socket.IO implementation instead.
const transport = String(process.env.REALTIME_TRANSPORT || 'uws').toLowerCase();
let uwsImpl = null;
if (transport !== 'socketio') {
  try {
    uwsImpl = await import('./realtime/uws.js');
  } catch (e) {
    console.error('[socket] uWebSockets failed to load, falling back to Socket.IO:', e?.message);
  }
}

function impl() {
  const t = String(process.env.REALTIME_TRANSPORT || 'uws').toLowerCase();
  if (t === 'socketio') return socketioImpl;
  return uwsImpl || socketioImpl;
}

export function initRealtime(server) { return impl().initRealtime(server); }
export function isWorkerOnline(workerId) { return impl().isWorkerOnline(workerId); }
export function getOnlineWorkerIds() { return impl().getOnlineWorkerIds(); }
export function emitDbChange(payload) { return impl().emitDbChange(payload); }
export function emitChat(conversationId, payload) { return impl().emitChat(conversationId, payload); }
export function emitChatBroadcast(payload) { return impl().emitChatBroadcast(payload); }
export function emitChatToUsers(uids, payload) { return impl().emitChatToUsers(uids, payload); }
export function emitRealtime(event, payload, room) { return impl().emitRealtime(event, payload, room); }
export function isRealtimeInitialized() { return impl().isRealtimeInitialized(); }
