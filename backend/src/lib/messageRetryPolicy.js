/**
 * Retry policy for outbound WhatsApp messages that Meta accepted and then
 * failed from a status callback (130429 "too many messages from this phone
 * number in a short period of time"), or that failed at send time after the
 * Graph helper (lib/whatsappGraphSend.js) exhausted its own in-process
 * retries.
 *
 * This lives apart from services/messageRetryScheduler.js so the decision —
 * what may be re-sent, how long to wait, when to stop — is testable with
 * node:test and no database. The scheduler owns only the claim-and-send
 * mechanics.
 */

import { classifyDeliveryFailure } from './whatsappErrorCodes.js';

// Backoff ladder for automatic retries: 1 minute after the failure (Meta's
// short window usually clears quickly), then 5 and 15 minutes. The index is
// the number of retries already attempted, so delayForAttempts(0) is the
// first retry's wait.
export const RETRY_DELAYS_MS = [60_000, 300_000, 900_000];

// Total automatic retries after the original send. The running count lives
// in messages.template_params.autoRetries (jsonb, so no schema migration).
export const MAX_AUTO_RETRIES = RETRY_DELAYS_MS.length;

// Only failures whose status_updated_at is within this window are
// auto-retried, so a weeks-old failed row never surprises a donor with a
// stale message. The manual Retry button bypasses this.
export const FAILURE_FRESHNESS_MS = 2 * 60 * 60 * 1000;

/**
 * What can be re-sent from the stored row alone:
 *  - 'template' rows built by sendTemplateReply — needs template_id and the
 *    raw variables under template_params.params (rows written before that
 *    key existed cannot rebuild the payload; the rendered body cannot be
 *    split back into variables, so they are skipped rather than risk
 *    resending a template with blank fields).
 *  - 'fro_reply' text/media rows — body_text + media_url carry everything
 *    sendFroReply needs.
 *
 * Deliberately excluded: receipt bookkeeping rows (message_category
 * 'template' without template_id, inserted already-sent by
 * whatsappController.recordReceiptInConversation), ai replies, automation
 * sends, interactive messages and inbound rows — none of their senders can
 * reconstruct a payload here yet.
 */
export function retryKindFor(row) {
  if (!row || row.direction !== 'outbound' || row.status !== 'failed') return null;
  if (!classifyDeliveryFailure(row.failure_reason).retryable) return null;

  if (row.message_category === 'template') {
    const params = row.template_params;
    if (!row.template_id || !params || !Array.isArray(params.params)) return null;
    return 'template';
  }
  if (row.message_category === 'fro_reply') {
    return row.body_text || row.media_url ? 'plain' : null;
  }
  return null;
}

/** Retries already used by this row (0 when the key is absent or garbage). */
export function attemptsFor(row) {
  const n = Number(row?.template_params?.autoRetries);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Full decision for one row.
 *
 * `manual` (the inbox Retry button) bypasses the attempt cap and the
 * freshness window — the agent explicitly asked — but not the kind and
 * retryability gates, which the button already mirrors via
 * classifyDeliveryFailure.
 *
 * Returns { kind, attempts, delayMs } where attempts is the number already
 * used (so the next send is attempt attempts + 1), or null when the row must
 * not be retried. delayMs is the wait before that next send; it is only
 * meaningful for automatic scheduling.
 */
export function retryDecision(row, { manual = false, now = Date.now() } = {}) {
  const kind = retryKindFor(row);
  if (!kind) return null;

  const attempts = attemptsFor(row);
  if (!manual) {
    if (attempts >= MAX_AUTO_RETRIES) return null;
    const at = Date.parse(row.status_updated_at || row.created_at || '');
    if (!Number.isFinite(at) || now - at > FAILURE_FRESHNESS_MS) return null;
  }

  return { kind, attempts, delayMs: delayForAttempts(attempts) };
}

/** Wait before the (attempts + 1)-th send; null when the ladder is exhausted. */
export function delayForAttempts(attempts) {
  if (!Number.isInteger(attempts) || attempts < 0 || attempts >= RETRY_DELAYS_MS.length) return null;
  return RETRY_DELAYS_MS[attempts];
}
