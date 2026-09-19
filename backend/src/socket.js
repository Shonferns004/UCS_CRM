import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io = null;

// Live-socket presence: worker ids holding at least one authenticated socket
// right now. This is the source of truth for "panel open", replacing timer
// heartbeats. Same-process only (single PM2 fork) — do NOT rely on this if
// the backend ever moves to multi-process cluster mode (would need redis).
const workerSockets = new Map(); // workerId (string) -> Set<socket.id>

export function isWorkerOnline(workerId) {
  if (workerId == null) return false;
  const set = workerSockets.get(String(workerId));
  return !!set && set.size > 0;
}

export function getOnlineWorkerIds() {
  const out = [];
  for (const [wid, set] of workerSockets) if (set.size > 0) out.push(wid);
  return out;
}

function trackPresence(socket) {
  const wid = socket.user && (socket.user.workerId || socket.user.id);
  if (wid == null) return null;
  const key = String(wid);
  let set = workerSockets.get(key);
  if (!set) {
    set = new Set();
    workerSockets.set(key, set);
  }
  set.add(socket.id);
  socket.on('disconnect', () => {
    const s = workerSockets.get(key);
    if (!s) return;
    s.delete(socket.id);
    if (s.size === 0) workerSockets.delete(key);
  });
  return key;
}

export function initRealtime(server) {
  if (io) return io;
  io = new Server(server, {
    cors: { origin: '*' },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    const token =
      (socket.handshake.auth && socket.handshake.auth.token) ||
      (socket.handshake.headers && socket.handshake.headers.authorization && socket.handshake.headers.authorization.split(' ')[1]);
    if (!token) return next(new Error('unauthorized'));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const role = (socket.user && socket.user.role) || 'unknown';
    socket.join(`role:${role}`);
    // FRO login tokens carry `id` (not `workerId`) — join both spellings so
    // worker-targeted events (fro:pause, fro:resume, …) actually reach panels.
    // Without this, pause/resume emits silently go nowhere.
    const wid = socket.user && (socket.user.workerId || socket.user.id);
    if (wid) socket.join(`worker:${wid}`);
    // Presence: an open authenticated socket means the panel is open, no
    // heartbeat timer needed. Multi-tab = multiple socket ids, one entry.
    trackPresence(socket);
  });

  return io;
}

export function emitDbChange(payload) {
  if (!io) return;
  io.emit('db:change', payload);
}

export function emitRealtime(event, payload, room) {
  if (!io) return;
  const target = room ? io.to(room) : io;
  target.emit(event, payload);
}

export function isRealtimeInitialized() {
  return !!io;
}
