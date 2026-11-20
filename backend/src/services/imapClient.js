import { ImapFlow } from 'imapflow';

// ---------------------------------------------------------------------------
// ImapFlow is an EventEmitter. Once the initial connect() promise has resolved,
// any later transport problem (socket timeout, reset, TLS failure) is reported
// only through client.emit('error', err). In Node an 'error' event without a
// listener is thrown as an uncaught exception, which kills the whole API
// process — that is exactly what happens when a mailbox socket sits idle past
// the 5 minute IMAP socketTimeout. Every client must therefore be created here
// so an 'error' listener is always attached before connect() is called.
// ---------------------------------------------------------------------------

const SOCKET_ERROR_CODES = new Set([
  'ETIMEOUT',
  'ECONNRESET',
  'ECONNABORTED',
  'ECONNREFUSED',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ESOCKET',
  'NoConnection',
]);

/** True for transport failures that only mean "this IMAP session died". */
export function isImapTransportError(error) {
  if (!error) return false;
  if (error._connId) return true;
  return SOCKET_ERROR_CODES.has(String(error.code || ''));
}

/**
 * Build an IMAP client that can never crash the process on a socket error.
 * Callers still handle failures through normal try/catch around the awaited
 * command (fetch/search throw once the session is gone); this listener only
 * makes sure the error event is consumed.
 */
export function createImapClient(config, label = 'imap') {
  const client = new ImapFlow(config);

  client.on('error', (error) => {
    console.error(
      `[${label}] IMAP connection error (session closed, server stays up):`,
      error?.message || error,
    );
  });

  return client;
}

/**
 * Log out of an IMAP session without letting a dead socket hang the request.
 * logout() can never resolve once the connection is gone, so it races a timer
 * and falls back to destroying the socket.
 */
export async function closeImapClient(client, { timeoutMs = 5000 } = {}) {
  if (!client) return;
  let timer = null;
  try {
    await Promise.race([
      client.logout(),
      new Promise((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
        timer.unref?.();
      }),
    ]);
  } catch {
    /* already closed */
  } finally {
    if (timer) clearTimeout(timer);
  }

  try {
    if (!client.usable) client.close();
  } catch {
    /* best effort */
  }
}
