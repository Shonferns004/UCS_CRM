/**
 * Paced, rate-limit-aware POST to Meta's WhatsApp /messages endpoint.
 *
 * Meta rejects bursts against one phone number with error 130429
 * ("Rate limit hit").  This module gives every send two protections:
 *
 *   1. PACE  — sends sharing a paceKey (the /messages URL, which already
 *              contains the phone number id) run one at a time with at least
 *              `minGapMs` between attempts, so an agent typing, the AI
 *              auto-reply and a broadcast collapse into one steady stream
 *              instead of fanning out in parallel.
 *   2. RETRY — 429s, HTTP 5xx and 130429 payloads are retried with
 *              exponential backoff (honouring Retry-After when Meta sends
 *              one).  Meta rejecting a call means the message was NOT
 *              accepted, so re-POSTing cannot create a duplicate.  A network
 *              drop mid-flight is ambiguous, so those propagate untouched.
 *
 * Failures throw `Error` with Meta's message rendered as "(130429) Rate limit
 * hit" — the same shape the webhook stores in `failure_reason`, so
 * classifyDeliveryFailure() / the Retry button work for send-time failures
 * too.
 */

const DEFAULT_MIN_GAP_MS = 60;
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 1200;
const MAX_RETRY_AFTER_MS = 30000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** paceKey -> tail of that account's serial send queue */
const queues = new Map();
/** paceKey -> epoch ms when the last attempt started */
const lastAttemptAt = new Map();

function isTransient(status, data) {
  if (status === 429 || status >= 500) return true;
  if (data?.error?.code === 130429) return true;
  return /rate limit/i.test(String(data?.error?.message || ''));
}

function metaError(data, status) {
  const code = data?.error?.code;
  const message = data?.error?.message || `WhatsApp API error (HTTP ${status})`;
  const err = new Error(code ? `(${code}) ${message}` : message);
  err.metaCode = code || null;
  err.status = status;
  return err;
}

export function postWhatsAppMessage(url, accessToken, body, options = {}) {
  const {
    paceKey = url,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    minGapMs = DEFAULT_MIN_GAP_MS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
  } = options;

  const run = async () => {
    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt += 1;

      const gap = minGapMs - (Date.now() - (lastAttemptAt.get(paceKey) || 0));
      if (gap > 0) await sleep(gap);
      lastAttemptAt.set(paceKey, Date.now());

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) return data;

      if (isTransient(res.status, data) && attempt < maxAttempts) {
        const retryAfterSec = Number(res.headers.get('retry-after'));
        const delay = retryAfterSec > 0
          ? Math.min(retryAfterSec * 1000, MAX_RETRY_AFTER_MS)
          : baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * Math.min(baseDelayMs, 400));
        await sleep(delay);
        continue;
      }

      throw metaError(data, res.status);
    }

    throw new Error('WhatsApp send failed');
  };

  // One send at a time per account: chain onto whatever the last caller left
  // behind, and swallow failures in the stored tail so a rejected send never
  // poisons the queue for the next one (callers still get their rejection).
  const tail = queues.get(paceKey) || Promise.resolve();
  const next = tail.then(run, run);
  queues.set(paceKey, next.catch(() => {}));
  return next;
}
