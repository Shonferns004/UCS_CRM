// Pure decision layer for "was this gateway call a message delete?" — kept free of imports so
// the passthrough audit hook can be reasoned about (and tested) without a database or gateway.

// The gateway's delete route is POST /api/sessions/:id/messages/delete.
const MESSAGE_DELETE_PATH = /^sessions\/([^/]+)\/messages\/delete(?:\?|$)/;

/**
 * Read a gateway request as a message-delete intent, or null when it is any other call.
 * Deliberately strict: an unknown shape must not be recorded as a deletion, because the
 * delete audit is only trustworthy if it never invents entries.
 */
export function parseMessageDeleteRequest({ method, subPath, body } = {}) {
  if (String(method || '').toUpperCase() !== 'POST') return null;
  const match = MESSAGE_DELETE_PATH.exec(String(subPath || ''));
  if (!match) return null;

  let sessionId = match[1] || '';
  try {
    sessionId = decodeURIComponent(sessionId);
  } catch {
    // A malformed escape cannot name a session we could attribute a delete to.
    return null;
  }
  const messageId = String(body?.messageId || '').trim();
  if (!sessionId || !messageId) return null;

  return {
    sessionId,
    messageId,
    chatId: String(body?.chatId || '').trim() || null,
    forEveryone: body?.forEveryone !== false,
  };
}
