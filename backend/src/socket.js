import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io = null;

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
