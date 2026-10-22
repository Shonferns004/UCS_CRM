// Facade over the realtime transport selected by REALTIME_TRANSPORT.
//
// Default is uWebSockets.js. Set REALTIME_TRANSPORT=socketio to use the legacy
// Socket.IO implementation (kept for rollback / A-B comparison).
import * as socketioImpl from './realtime/socketio.legacy.js';
import * as uwsImpl from './realtime/uws.js';

function impl() {
  const transport = String(process.env.REALTIME_TRANSPORT || 'uws').toLowerCase();
  return transport === 'socketio' ? socketioImpl : uwsImpl;
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
