import { Readable } from 'node:stream';
import { Router } from 'express';
import db from '../config/db.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { resolveFroIdentity, stationAccessForWorker } from './openwaAssignmentsRoutes.js';

// A session-scoped gateway proxy for FRO logins. It only forwards the chats side of
// the assigned session — never the session list of another number, never session
// lifecycle, plugins, logs or API keys.
const router = Router();

const GATEWAY_PREFIX = '/api';
const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'content-disposition',
  'cache-control',
  'etag',
  'last-modified',
];

// Chat-side sections an FRO may read/write. Session lifecycle (start/stop/logout/
// pairing), config, proxy, templates, webhooks and plugins are deliberately absent.
const ALLOWED_SESSION_SECTIONS = new Set([
  'chats',
  'messages',
  'contacts',
  'status',
  'groups',
  'profile',
  'media',
  'labels',
]);

function gatewayConfig() {
  return {
    baseUrl: String(process.env.OPENWA_GATEWAY_URL || process.env.OPENWA_URL || '').replace(/\/+$/, ''),
    apiKey: String(process.env.OPENWA_GATEWAY_API_KEY || process.env.OPENWA_API_KEY || ''),
  };
}

async function assignedSessionIds(req) {
  const identity = await resolveFroIdentity(req);
  if (!identity) return new Set();

  // Permanent stations plus live temporary grants, so a temporary FRO can open the
  // assigned station's chats too; the permanent owner keeps access as well.
  const { permanent, temporary } = await stationAccessForWorker(
    identity.workerId,
    identity.agentId,
  );
  const keys = new Set([...permanent, ...temporary]);
  if (keys.size === 0) return new Set();

  const { data: assignments } = await db
    .from('whatsapp_session_assignments')
    .select('session_id, ngo_id, station');
  const sessionIds = new Set();
  for (const row of assignments || []) {
    if (row.station && keys.has(`${row.ngo_id}\u0000${row.station}`)) sessionIds.add(row.session_id);
  }
  return sessionIds;
}

async function forward(req, res, targetUrl, body) {
  const { apiKey } = gatewayConfig();
  const headers = { Accept: req.headers.accept || 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
  if (req.headers.range) headers.Range = req.headers.range;

  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body,
    redirect: 'manual',
  });

  res.status(response.status);
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = response.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  if (!response.body) return res.end();
  Readable.fromWeb(response.body)
    .on('error', () => res.end())
    .pipe(res);
}

router.use(authenticate);

router.all('/gateway/*', async (req, res) => {
  const { baseUrl } = gatewayConfig();
  if (!baseUrl) {
    return res.status(503).json({ message: 'OpenWA gateway is not configured on the backend.' });
  }

  try {
    const allowed = await assignedSessionIds(req);
    if (allowed.size === 0) {
      return res.status(403).json({ message: 'No WhatsApp session is assigned to you.' });
    }

    const subPath = req.params[0] || '';
    const segments = subPath.split('/').filter(Boolean);
    const first = segments[0] || '';
    const queryIndex = req.originalUrl.indexOf('?');
    const query = queryIndex === -1 ? '' : req.originalUrl.slice(queryIndex);
    const params = new URLSearchParams(query);

    // Session list: only the sessions this FRO is assigned to.
    if (first === 'sessions' && segments.length === 1) {
      if (req.method !== 'GET') return res.status(403).json({ message: 'Forbidden' });
      const response = await fetch(`${baseUrl}${GATEWAY_PREFIX}/sessions${query}`, {
        headers: {
          Accept: 'application/json',
          ...(gatewayConfig().apiKey ? { 'X-API-Key': gatewayConfig().apiKey } : {}),
        },
      });
      const body = await response.text();
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        payload = null;
      }
      if (!Array.isArray(payload)) return res.status(response.status).json({ message: 'Unexpected gateway response' });
      const filtered = payload.filter((session) => allowed.has(session.id));
      return res.status(response.status).json(filtered);
    }

    // Global message search: pin it to an allowed session.
    if (first === 'search') {
      const requested = params.get('sessionId');
      if (requested) {
        if (!allowed.has(requested)) return res.status(403).json({ message: 'Forbidden' });
      } else if (allowed.size === 1) {
        params.set('sessionId', [...allowed][0]);
      } else {
        return res.status(403).json({ message: 'sessionId is required' });
      }
      const target = `${baseUrl}${GATEWAY_PREFIX}/${subPath}?${params.toString()}`;
      return forward(req, res, target);
    }

    if (first !== 'sessions' || !segments[1]) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const sessionId = decodeURIComponent(segments[1]);
    if (!allowed.has(sessionId)) return res.status(403).json({ message: 'Forbidden' });

    const rest = segments.slice(2);
    if (rest.length === 0) {
      if (req.method !== 'GET') return res.status(403).json({ message: 'Forbidden' });
    } else if (!ALLOWED_SESSION_SECTIONS.has(rest[0])) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // Forward the body exactly as the admin proxy does: express.json has parsed JSON,
    // anything else (multipart media) is still on the request stream.
    let body;
    let streaming = false;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.body !== undefined) {
        body = JSON.stringify(req.body);
      } else if (req.readable && !req.readableEnded) {
        body = req;
        streaming = true;
      }
    }

    const target = `${baseUrl}${GATEWAY_PREFIX}/${subPath}${params.toString() ? `?${params.toString()}` : ''}`;
    if (streaming) {
      const { apiKey } = gatewayConfig();
      const headers = { Accept: req.headers.accept || 'application/json' };
      if (apiKey) headers['X-API-Key'] = apiKey;
      if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
      const response = await fetch(target, {
        method: req.method,
        headers,
        body: req,
        redirect: 'manual',
        duplex: 'half',
      });
      res.status(response.status);
      for (const name of FORWARDED_RESPONSE_HEADERS) {
        const value = response.headers.get(name);
        if (value) res.setHeader(name, value);
      }
      if (!response.body) return res.end();
      return Readable.fromWeb(response.body)
        .on('error', () => res.end())
        .pipe(res);
    }

    return forward(req, res, target, body);
  } catch (error) {
    if (res.headersSent) return res.end();
    return res.status(502).json({ message: `Cannot reach OpenWA gateway: ${error.message}` });
  }
});

export default router;
