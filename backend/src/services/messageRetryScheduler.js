/**
 * Auto-retry for outbound WhatsApp messages that failed after (or during)
 * the send — most importantly the 130429 case, where Meta ACCEPTS the POST
 * (200 + wamid, row marked 'sent') and then fails the message from a status
 * callback seconds later with "too many messages sent from this phone
 * number in a short period of time". Send-time pacing
 * (lib/whatsappGraphSend.js) can never see that failure, so without this
 * scheduler the row just sits 'failed' until somebody notices.
 *
 * Two triggers feed one claim-and-send path:
 *  - whatsappWebhookController calls scheduleAutoRetry() the moment a
 *    failed status lands on a messages row;
 *  - a 60s sweep re-discovers eligible failures the process may have
 *    missed: send-time failures after the Graph helper gave up, rows left
 *    behind by a restart, timers that died with the previous process.
 *
 * The claim — update failed -> queued guarded by .eq('status','failed') —
 * is what makes local dev and the EC2 production backend safe to sweep the
 * same shared database concurrently: only one of them can win a row, and a
 * lost race sees no row and does nothing.
 */

import db from '../config/db.js';
import {
  RETRY_DELAYS_MS,
  MAX_AUTO_RETRIES,
  FAILURE_FRESHNESS_MS,
  retryDecision,
  delayForAttempts,
} from '../lib/messageRetryPolicy.js';
import { sendTemplateReply, sendFroReply } from './froWhatsAppService.js';

// message id -> setTimeout handle, for a retry that is waiting out its
// backoff (or the rare case where an attempt is still on the wire). Guards
// every schedule site so a webhook redelivery cannot stack a second timer.
const pending = new Map();

/**
 * Atomically take ownership of a row: failed -> queued, old wamid dropped
 * (so a late duplicate status frame for the previous attempt can no longer
 * match this row), attempt counter incremented. Returns the claim with the
 * decision, or null when someone else won the race or policy says no.
 */
async function claimRow(row, manual) {
  const decision = retryDecision(row, { manual });
  if (!decision) return null;

  const attempts = decision.attempts + 1;
  const { data: claimed, error } = await db
    .from('messages')
    .update({
      status: 'queued',
      wa_message_id: null,
      status_updated_at: new Date().toISOString(),
      template_params: { ...(row.template_params || {}), autoRetries: attempts },
    })
    .eq('id', row.id)
    .eq('status', 'failed')
    .eq('direction', 'outbound')
    .select('id')
    .maybeSingle();

  if (error || !claimed) return null;
  return { ...decision, attempts };
}

/**
 * One retry attempt: claim, dispatch to the original sender with
 * existingMessageId (so the thread keeps a single bubble instead of growing
 * a duplicate), and on failure repair/reschedule.
 */
async function runAttempt(id, { manual = false } = {}) {
  pending.delete(id);

  const { data: row } = await db.from('messages').select('*').eq('id', id).maybeSingle();
  if (!row) return { outcome: 'missing' };

  const claimed = await claimRow(row, manual);
  if (!claimed) return { outcome: 'skipped' };

  try {
    if (claimed.kind === 'template') {
      const stored = row.template_params || {};
      await sendTemplateReply(
        row.conversation_id,
        row.user_id,
        row.template_id,
        Array.isArray(stored.params) ? stored.params : [],
        row.media_url || null,
        stored.headerMediaName || null,
        { existingMessageId: row.id },
      );
    } else {
      await sendFroReply(
        row.conversation_id,
        row.user_id,
        row.body_text,
        row.media_url || null,
        row.media_mime_type || null,
        { existingMessageId: row.id },
      );
    }
    console.log(`[wa-retry] resent message ${row.id} (attempt ${claimed.attempts}/${MAX_AUTO_RETRIES}, kind=${claimed.kind})`);
    return { outcome: 'sent', attempts: claimed.attempts };
  } catch (err) {
    const reason = String(err?.message || err).slice(0, 300);
    const statusCode = Number(err?.statusCode) || 0;

    // Refusals before the Graph call — expired temporary access (403 from
    // assertFroProjectSend), closed 24-hour window (422 from sendFroReply)
    // — never reach the sender's own failure write, so without this repair
    // the row would hang in 'queued' forever. Those refusals are permanent
    // for an identical resend: stop the ladder here.
    await db
      .from('messages')
      .update({ status: 'failed', failure_reason: reason, status_updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'queued')
      .eq('wa_message_id', null)
      .select('id')
      .maybeSingle();

    const terminal = statusCode === 403 || statusCode === 422;
    if (!manual && !terminal && claimed.attempts < MAX_AUTO_RETRIES) {
      const delay = delayForAttempts(claimed.attempts);
      if (delay != null) scheduleRetry(id, delay);
    }
    console.warn(`[wa-retry] attempt ${claimed.attempts} failed for message ${row.id}: ${reason}`);
    return { outcome: 'failed', error: reason };
  }
}

/** Arms one retry. Returns false when a timer for this row already exists. */
export function scheduleRetry(id, delayMs) {
  if (!id || delayMs == null || pending.has(id)) return false;
  const timer = setTimeout(() => {
    runAttempt(id).catch((e) => console.error(`[wa-retry] attempt crashed for ${id}:`, e?.message || e));
  }, delayMs);
  if (typeof timer.unref === 'function') timer.unref();
  pending.set(id, timer);
  return true;
}

/** Webhook hook: first retry one minute after Meta reports the failure. */
export function scheduleAutoRetry(id) {
  return scheduleRetry(id, RETRY_DELAYS_MS[0]);
}

/** Manual Retry button: attempt now, ignoring cap and freshness. */
export async function retryMessageNow(id) {
  if (!id) return { outcome: 'missing' };
  return runAttempt(String(id), { manual: true });
}

/**
 * Re-discover eligible failures this process may have missed (send-time
 * failures the Graph helper already gave up on, rows orphaned by a restart).
 * Bounded to the freshness window and to the newest 100 rows per tick.
 */
async function sweep() {
  try {
    const { data: rows, error } = await db
      .from('messages')
      .select('*')
      .eq('direction', 'outbound')
      .eq('status', 'failed')
      .gte('status_updated_at', new Date(Date.now() - FAILURE_FRESHNESS_MS).toISOString())
      .order('status_updated_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    for (const row of rows || []) {
      if (pending.has(row.id)) continue;
      if (!retryDecision(row)) continue;
      scheduleRetry(row.id, RETRY_DELAYS_MS[0]);
    }
  } catch (e) {
    console.error('[wa-retry] sweep failed:', e?.message || e);
  }
}

let stopSweep = null;

/** Starts the periodic sweep. Idempotent; timers are unref'd. */
export function startAutoRetrySweep({ initialDelayMs = 30_000, intervalMs = 60_000 } = {}) {
  if (stopSweep) return stopSweep;
  const first = setTimeout(sweep, initialDelayMs);
  if (typeof first.unref === 'function') first.unref();
  const recurring = setInterval(sweep, intervalMs);
  if (typeof recurring.unref === 'function') recurring.unref();
  stopSweep = () => {
    clearTimeout(first);
    clearInterval(recurring);
    stopSweep = null;
  };
  return stopSweep;
}
