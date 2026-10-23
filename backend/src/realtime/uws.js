import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const uWS = require('uWebSockets.js');
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import db from '../config/db.js';

const PORT = Number(process.env.WS_PORT || process.env.UWS_PORT || 5001);
const HOST = process.env.WS_HOST || '0.0.0.0';

function allowedOrigins() {
  const raw = process.env.WS_ALLOWED_ORIGINS || process.env.CORS_ORIGINS || process.env.CLIENT_ORIGIN || '*';
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}
function originAllowed(origin) {
  const list = allowedOrigins();
  if (list.includes('*')) return true;
  if (!origin) return true; // non-browser clients (probes, mobile)
  return list.includes(origin);
}

let app = null;
const clients = new Set();
const topics = new Map(); // topic -> Set<ws>
const meta = new WeakMap(); // ws -> { id, authed, user, topics:Set, authTimer }

const workerSockets = new Map(); // workerId (string) -> Set<ws>

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

function addToPresence(wid, ws) {
  if (wid == null) return;
  const key = String(wid);
  let set = workerSockets.get(key);
  if (!set) { set = new Set(); workerSockets.set(key, set); }
  set.add(ws);
}
function removeFromPresence(wid, ws) {
  if (wid == null) return;
  const key = String(wid);
  const set = workerSockets.get(key);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) workerSockets.delete(key);
}

function send(ws, obj) {
  try { ws.send(JSON.stringify(obj)); } catch { /* ignore */ }
}
function broadcastTopic(topic, obj) {
  const set = topics.get(topic);
  if (!set) return;
  const text = JSON.stringify(obj);
  for (const ws of set) {
    const m = meta.get(ws);
    if (m && m.authed) try { ws.send(text); } catch { /* ignore */ }
  }
}
function broadcastAll(obj) {
  const text = JSON.stringify(obj);
  for (const ws of clients) {
    const m = meta.get(ws);
    if (m && m.authed) try { ws.send(text); } catch { /* ignore */ }
  }
}

function joinTopic(ws, topic) {
  if (!topic) return;
  const m = meta.get(ws);
  if (!m) return;
  let set = topics.get(topic);
  if (!set) { set = new Set(); topics.set(topic, set); }
  set.add(ws);
  m.topics.add(topic);
}
function leaveTopic(ws, topic) {
  const set = topics.get(topic);
  if (set) { set.delete(ws); if (set.size === 0) topics.delete(topic); }
  const m = meta.get(ws);
  if (m) m.topics.delete(topic);
}

function chatUidOf(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  const id = user?.id ?? user?.workerId;
  if (id != null && String(id) !== '') return `login:${id}`;
  return null;
}

async function joinChatRooms(ws) {
  const m = meta.get(ws);
  if (!m || !m.authed || !m.user) return;
  const user = m.user;
  const email = String(user.email || '').trim().toLowerCase();
  const uid = email
    ? `email:${email}`
    : (user.id ?? user.workerId) != null && String(user.id ?? user.workerId) !== ''
      ? `login:${user.id ?? user.workerId}`
      : null;
  if (!uid) return;
  let rows = [];
  try {
    const res = await db._pool.query(
      `SELECT conversation_id FROM chat_participants WHERE uid = $1`,
      [uid]
    );
    rows = res.rows || [];
  } catch (e) {
    console.warn('[uws] chat room join failed:', e?.message || String(e));
    return;
  }
  for (const r of rows) joinTopic(ws, `chat:${r.conversation_id}`);
}

function relayTyping(ws, payload) {
  const m = meta.get(ws);
  if (!m || !m.authed) return;
  const conversationId = Number(payload?.conversation_id);
  if (!Number.isInteger(conversationId)) return;
  const topic = `chat:${conversationId}`;
  if (!m.topics.has(topic)) return;
  const out = {
    type: 'chat:typing',
    payload: {
      conversation_id: conversationId,
      uid: chatUidOf(m.user),
      name: m.user?.name || '',
      typing: !!payload?.typing,
    },
  };
  const set = topics.get(topic);
  if (!set) return;
  const text = JSON.stringify(out);
  for (const c of set) {
    if (c === ws) continue;
    const cm = meta.get(c);
    if (cm && cm.authed) try { c.send(text); } catch { /* ignore */ }
  }
}

function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

export function initRealtime(server) {
  if (app) return;
  app = uWS.App();

  app.ws('/*', {
    compression: uWS.SHARED_COMPRESSOR,
    maxPayloadLength: 1 * 1024 * 1024,
    idleTimeout: 120,
    maxBackpressure: 1024 * 1024,
    upgrade: (res, req, context) => {
      const origin = req.getHeader('origin');
      if (!originAllowed(origin)) {
        console.warn('[uws] origin rejected:', origin);
        res.writeStatus('403 Forbidden');
        res.end();
        return;
      }
      res.upgrade(
        {},
        req.getHeader('sec-websocket-key'),
        req.getHeader('sec-websocket-protocol'),
        req.getHeader('sec-websocket-extensions'),
        context
      );
    },
    open: (ws) => {
      const m = {
        id: crypto.randomUUID(),
        authed: false,
        user: null,
        topics: new Set(),
        authTimer: setTimeout(() => {
          const cur = meta.get(ws);
          if (cur && !cur.authed) {
            try { ws.close(); } catch { /* ignore */ }
          }
        }, 10000),
      };
      meta.set(ws, m);
      clients.add(ws);
    },
    message: (ws, message, isBinary) => {
      const m = meta.get(ws);
      if (!m) { try { ws.close(); } catch {} return; }
      let text;
      try { text = Buffer.from(message).toString('utf8'); } catch { try { ws.close(); } catch {} return; }
      let msg;
      try { msg = JSON.parse(text); } catch {
        send(ws, { type: 'error', payload: { message: 'bad_json' } });
        return;
      }
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
        send(ws, { type: 'error', payload: { message: 'bad_message' } });
        return;
      }

      if (!m.authed) {
        if (msg.type !== 'auth' || !msg.payload || !msg.payload.token) {
          send(ws, { type: 'auth:error', payload: { message: 'unauthorized' } });
          try { ws.close(); } catch {}
          return;
        }
        const user = verifyToken(msg.payload.token);
        if (!user) {
          console.warn('[uws] auth failed: invalid token');
          send(ws, { type: 'auth:error', payload: { message: 'unauthorized' } });
          try { ws.close(); } catch {}
          return;
        }
        console.info('[uws] auth ok:', user.id, user.role);
        if (m.authTimer) { clearTimeout(m.authTimer); m.authTimer = null; }
        m.authed = true;
        m.user = user;

        const role = (user && user.role) || 'unknown';
        joinTopic(ws, `role:${role}`);
        const wid = user && (user.workerId || user.id);
        if (wid) {
          joinTopic(ws, `worker:${wid}`);
          addToPresence(wid, ws);
        }
        const opWid = user && user.impersonation && user.imposter_id;
        if (opWid) {
          joinTopic(ws, `worker:${opWid}`);
          addToPresence(opWid, ws);
        }
        joinTopic(ws, 'voting');
        const chatUid = chatUidOf(user);
        if (chatUid) joinTopic(ws, `chatuser:${chatUid}`);
        joinChatRooms(ws).catch((e) =>
          console.warn('[uws] chat room join failed:', e?.message || String(e))
        );

        send(ws, { type: 'auth:ok', payload: { user: { id: user.id, role: user.role, name: user.name } } });
        return;
      }

      const type = msg.type;
      if (type === 'chat:join') {
        joinChatRooms(ws).catch((e) =>
          console.warn('[uws] chat room join failed:', e?.message || String(e))
        );
        return;
      }
      if (type === 'chat:typing') {
        relayTyping(ws, msg.payload || {});
        return;
      }
      if (type === 'ping') {
        send(ws, { type: 'pong', payload: { ts: Date.now() } });
        return;
      }
      send(ws, { type: 'error', payload: { message: 'unknown_type' } });
    },
    close: (ws, code, message) => {
      const m = meta.get(ws);
      clients.delete(ws);
      if (m) {
        for (const t of Array.from(m.topics)) {
          const set = topics.get(t);
          if (set) { set.delete(ws); if (set.size === 0) topics.delete(t); }
        }
        m.topics.clear();
        if (m.authed && m.user) {
          const wid = m.user.workerId || m.user.id;
          removeFromPresence(wid, ws);
          const opWid = m.user.impersonation && m.user.imposter_id;
          if (opWid) removeFromPresence(opWid, ws);
        }
        if (m.authTimer) { clearTimeout(m.authTimer); m.authTimer = null; }
      }
      meta.delete(ws);
    },
  });

  app.listen(HOST, PORT, (listenSocket) => {
    if (!listenSocket) {
      console.error(`[uws] failed to listen on ${HOST}:${PORT}`);
      return;
    }
    console.log(`[uws] realtime listening on ${HOST}:${PORT}`);
  });
}

export function emitDbChange(payload) {
  if (!app) return;
  if (payload && payload.table) console.info('[uws] emit db:change', payload.table, payload.eventType || '');
  broadcastAll({ type: 'db:change', payload });
}
export function emitChat(conversationId, payload) {
  if (!app) return;
  broadcastTopic(`chat:${conversationId}`, { type: 'chat:message', payload });
}
export function emitChatBroadcast(payload) {
  if (!app) return;
  broadcastAll({ type: 'chat:message', payload });
}
export function emitChatToUsers(uids, payload) {
  if (!app) return;
  for (const uid of new Set(uids)) {
    if (uid) broadcastTopic(`chatuser:${uid}`, { type: 'chat:message', payload });
  }
}
export function emitRealtime(event, payload, room) {
  if (!app) return;
  const msg = { type: event, payload };
  if (room) broadcastTopic(room, msg);
  else broadcastAll(msg);
}
export function isRealtimeInitialized() {
  return !!app;
}