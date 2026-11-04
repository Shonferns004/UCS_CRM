import { Readable } from 'node:stream';
import { Router } from 'express';
import { authenticate, requireWhatsAppAdmin } from '../../middleware/authMiddleware.js';
import db from '../../config/db.js';
import { recordMessageDeletion, parseMessageDeleteRequest } from '../../services/whatsappDeletionLog.js';

const router = Router();

const GATEWAY_PREFIX = '/api';

function gatewayConfig() {
  return {
    baseUrl: String(process.env.OPENWA_GATEWAY_URL || process.env.OPENWA_URL || '').replace(/\/+$/, ''),
    apiKey: String(process.env.OPENWA_GATEWAY_API_KEY || process.env.OPENWA_API_KEY || ''),
    timeoutMs: Number(process.env.OPENWA_GATEWAY_TIMEOUT_MS) || 15000,
  };
}

class GatewayError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'GatewayError';
    this.status = status;
  }
}

async function gatewayRequest(path, { method = 'GET', body } = {}) {
  const { baseUrl, apiKey, timeoutMs } = gatewayConfig();
  if (!baseUrl) {
    throw new GatewayError(
      'OpenWA gateway is not configured. Set OPENWA_GATEWAY_URL on the backend.',
      503
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = { Accept: 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${baseUrl}${GATEWAY_PREFIX}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      const raw = payload && typeof payload === 'object' ? payload.message ?? payload.error : payload;
      const message = Array.isArray(raw) ? raw.join(', ') : raw || `OpenWA gateway responded ${response.status}`;
      throw new GatewayError(String(message), response.status);
    }

    return payload;
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    if (error.name === 'AbortError') {
      throw new GatewayError('OpenWA gateway request timed out', 504);
    }
    throw new GatewayError(`Cannot reach OpenWA gateway: ${error.message}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

function sendError(res, error) {
  const status = error instanceof GatewayError ? error.status : 500;
  const message = error?.message || 'Unexpected error';
  if (status >= 500) console.error('[openwa]', message);
  return res.status(status).json({ success: false, message });
}

function sessionId(req) {
  return encodeURIComponent(req.params.id);
}

function normalizeSessionName(value) {
  if (typeof value !== 'string') return '';
  // A session name is a free-text label (the gateway routes by UUID). Keep symbols, spaces and
  // non-Latin scripts; only strip control characters and collapse runs of whitespace so the
  // name stays a single readable line.
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Count code points, not UTF-16 units: cutting an emoji in half leaves a lone surrogate.
  return Array.from(cleaned).slice(0, 50).join('');
}

router.use(authenticate, requireWhatsAppAdmin);

// GET /openwa/status - List all engines/sessions (client expects { data: [...] })
router.get('/status', async (req, res) => {
  try {
    const payload = await gatewayRequest('/sessions');
    const sessions = Array.isArray(payload) ? payload : payload?.data ?? [];
    return res.json({ success: true, data: sessions });
  } catch (error) {
    return sendError(res, error);
  }
});

// GET /openwa/sessions - Alias for /status
router.get('/sessions', async (req, res) => {
  try {
    const payload = await gatewayRequest('/sessions');
    const sessions = Array.isArray(payload) ? payload : payload?.data ?? [];
    return res.json({ success: true, data: sessions });
  } catch (error) {
    return sendError(res, error);
  }
});

// POST /openwa/connect - Create a new engine/session
router.post('/connect', async (req, res) => {
  try {
    const requested = normalizeSessionName(req.body?.name ?? req.body?.sessionId);
    const name = requested || `engine-${Date.now().toString(36)}`;
    const session = await gatewayRequest('/sessions', { method: 'POST', body: { name } });
    return res.status(201).json({ success: true, data: session });
  } catch (error) {
    return sendError(res, error);
  }
});

// GET /openwa/sessions/:id - Session details
router.get('/sessions/:id', async (req, res) => {
  try {
    const session = await gatewayRequest(`/sessions/${sessionId(req)}`);
    return res.json({ success: true, data: session });
  } catch (error) {
    return sendError(res, error);
  }
});

// GET /openwa/sessions/:id/status - Session status (alias)
router.get('/sessions/:id/status', async (req, res) => {
  try {
    const session = await gatewayRequest(`/sessions/${sessionId(req)}`);
    return res.json({ success: true, data: session });
  } catch (error) {
    return sendError(res, error);
  }
});

// GET /openwa/sessions/:id/qr - Pairing QR code
router.get('/sessions/:id/qr', async (req, res) => {
  try {
    const payload = await gatewayRequest(`/sessions/${sessionId(req)}/qr`);
    return res.json({
      success: true,
      qrCode: payload?.qrCode ?? null,
      status: payload?.status ?? null,
      data: payload,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// POST /openwa/sessions/:id/start - Start a session
router.post('/sessions/:id/start', async (req, res) => {
  try {
    const result = await gatewayRequest(`/sessions/${sessionId(req)}/start`, { method: 'POST' });
    return res.json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
});

// POST /openwa/sessions/:id/stop - Stop a session
router.post('/sessions/:id/stop', async (req, res) => {
  try {
    const result = await gatewayRequest(`/sessions/${sessionId(req)}/stop`, { method: 'POST' });
    return res.json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
});

// POST /openwa/sessions/:id/disconnect - Log out / unlink the WhatsApp account
router.post('/sessions/:id/disconnect', async (req, res) => {
  try {
    const result = await gatewayRequest(`/sessions/${sessionId(req)}/logout`, { method: 'POST' });
    return res.json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
});

// POST /openwa/sessions/:id/pairing-code - Request a phone-number pairing code
router.post('/sessions/:id/pairing-code', async (req, res) => {
  try {
    const result = await gatewayRequest(`/sessions/${sessionId(req)}/pairing-code`, {
      method: 'POST',
      body: req.body ?? {},
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
});

// DELETE /openwa/sessions/:id - Delete a session
router.delete('/sessions/:id', async (req, res) => {
  try {
    const result = await gatewayRequest(`/sessions/${sessionId(req)}`, { method: 'DELETE' });
    return res.json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
});

// ---------------------------------------------------------------------------
// Generic gateway passthrough. The curated routes above cover the engine
// lifecycle; the full OpenWA dashboard also needs chats, messages, stats,
// templates, webhooks, logs, plugins and infrastructure. Instead of copying
// ~50 endpoint definitions, forward /api/openwa/gateway/<path> to
// <gateway>/api/<path> and inject the API key server-side, so the browser
// never holds the gateway credential. The router-level CRM auth guard above
// still gates every call.
// ---------------------------------------------------------------------------
const PASSTHROUGH_TIMEOUT_MS = 120000;
const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'content-disposition',
  'cache-control',
  'etag',
  'last-modified',
];

// A message delete through the proxy is the one gateway call whose effect is destructive and
// unrecoverable: the gateway clears the row to an empty `revoked` tombstone. Capture the row
// before forwarding so the CRM can say who deleted what, from which station.
export async function captureMessageDeletion(req, subPath) {
  const intent = parseMessageDeleteRequest({
    method: req.method,
    subPath,
    body: req.body,
  });
  if (!intent) return null;

  try {
    const { rows } = await db._pool.query(
      `SELECT body, type, direction, "chatName", "chatId"
         FROM openwa.messages
        WHERE "sessionId" = $1 AND "waMessageId" = $2
        LIMIT 1`,
      [intent.sessionId, intent.messageId],
    );
    const original = rows[0] || null;
    return {
      sessionId: intent.sessionId,
      messageId: intent.messageId,
      chatId: intent.chatId || original?.chatId || null,
      chatName: original?.chatName || null,
      body: original?.body ?? '',
      type: original?.type || null,
      direction: original?.direction || null,
      forEveryone: intent.forEveryone,
    };
  } catch {
    // Logging the delete must never block the delete itself.
    return null;
  }
}

router.all('/gateway/*', async (req, res) => {
  const { baseUrl, apiKey } = gatewayConfig();
  if (!baseUrl) {
    return res.status(503).json({
      success: false,
      message: 'OpenWA gateway is not configured. Set OPENWA_GATEWAY_URL on the backend.',
    });
  }

  const subPath = req.params[0] || '';
  const queryIndex = req.originalUrl.indexOf('?');
  const query = queryIndex === -1 ? '' : req.originalUrl.slice(queryIndex);
  const target = `${baseUrl}${GATEWAY_PREFIX}/${subPath}${query}`;

  const deletionCapture = await captureMessageDeletion(req, subPath);

  const headers = { Accept: req.headers.accept || 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
  if (req.headers['if-none-match']) headers['If-None-Match'] = req.headers['if-none-match'];
  if (req.headers.range) headers.Range = req.headers.range;

  // express.json() has already consumed JSON bodies, so re-serialise those.
  // Anything it did not parse (multipart uploads, octet-stream) is still on the
  // request stream and is forwarded as-is.
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PASSTHROUGH_TIMEOUT_MS);
  try {
    const response = await fetch(target, {
      method: req.method,
      headers,
      body,
      signal: controller.signal,
      redirect: 'manual',
      ...(streaming ? { duplex: 'half' } : {}),
    });

    res.status(response.status);
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = response.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    // The gateway accepted the delete: record the actor now, in the background, so the
    // response is not delayed by the audit write.
    if (deletionCapture && response.ok) {
      void recordMessageDeletion(req, deletionCapture).catch(() => undefined);
    }

    if (!response.body) return res.end();
    Readable.fromWeb(response.body)
      .on('error', () => res.end())
      .pipe(res);
  } catch (error) {
    if (res.headersSent) return res.end();
    if (error.name === 'AbortError') {
      return res.status(504).json({ success: false, message: 'OpenWA gateway request timed out' });
    }
    return res
      .status(502)
      .json({ success: false, message: `Cannot reach OpenWA gateway: ${error.message}` });
  } finally {
    clearTimeout(timer);
  }
});

export default router;
