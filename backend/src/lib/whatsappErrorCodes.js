/**
 * Meta delivery-failure classification for the CRM inbox.
 *
 * The CRM's `messages` table has no `error_code` column — the webhook stores the
 * code inside `failure_reason` as "(131047) Re-engagement message"
 * (whatsappWebhookController.js). So the code is recovered from that string here
 * rather than from a column.
 *
 * Why this exists: some Meta failures are permanent. Retrying one re-sends the
 * identical payload, so Meta rejects it again with the identical code, every
 * time — burning a call and telling the agent nothing new. Those must be refused
 * up front and answered with a remedy instead.
 *
 * Default is retryable: an unknown or absent code keeps the previous behaviour,
 * because most failures really are transient (network, 5xx, rate limit).
 */

export const REMEDY_TEMPLATE = 'template';

/** Codes where a second identical attempt cannot succeed. */
const PERMANENT_FAILURES = {
  131047: {
    title: 'The 24-hour customer-care window is closed.',
    remedy: REMEDY_TEMPLATE,
    hint:
      'The customer has not replied in the last 24 hours, so WhatsApp only accepts an approved template now. ' +
      'Sending this text again cannot succeed.',
  },
  // Meta per-user marketing template limit: the recipient has hit WhatsApp's
  // engagement cap, so this marketing template cannot be delivered now.
  // Retrying immediately fails again (and can extend the block); wait ~24h or
  // have the contact message first. Not a template-content problem.
  131049: {
    title: 'Meta did not deliver this marketing message.',
    remedy: REMEDY_TEMPLATE,
    hint:
      'WhatsApp limited marketing messages to this contact (per-user marketing cap). ' +
      'Wait at least 24 hours before retrying, or ask the contact to message you first. ' +
      'Do not retry immediately.',
  },
  // Template payload problems: the same template resent with the same variables
  // fails identically. Only a different template can clear these.
  132000: {
    title: 'This template is paused.',
    remedy: REMEDY_TEMPLATE,
    hint: 'Meta has paused this template. Use a different approved template.',
  },
  132001: {
    title: 'This template no longer exists.',
    remedy: REMEDY_TEMPLATE,
    hint: 'The template was deleted from the Meta account. Use a different approved template.',
  },
  132012: {
    title: 'The template parameters do not match its definition.',
    remedy: REMEDY_TEMPLATE,
    hint: 'Re-pick the template and fill its variables in again.',
  },
  132015: {
    title: 'This template has been archived.',
    remedy: REMEDY_TEMPLATE,
    hint: 'The template was archived in the Meta account. Use a different approved template.',
  },
};

/**
 * 131026 ("message undeliverable") is deliberately NOT listed. It covers several
 * unrelated situations (number not on WhatsApp, recipient blocked, carrier bounce)
 * and a failed send can still land later, so it stays retryable.
 */
const RETRYABLE_DEFAULT = {
  retryable: true,
  remedy: 'retry',
  title: 'WhatsApp could not deliver this message.',
  hint: 'This is usually temporary. Try again in a moment.',
};

/**
 * Recovers the Meta numeric code from a stored `failure_reason`.
 * Matches the webhook's "(131047) Re-engagement message" form, tolerating older
 * rows where the code may not sit at position 0. Returns null when there is none.
 */
export function parseMetaErrorCode(failureReason) {
  const text = String(failureReason ?? '');
  const leading = /^\s*\((\d{4,6})\)/.exec(text);
  if (leading) return Number(leading[1]);
  const anywhere = /\((\d{4,6})\)/.exec(text);
  return anywhere ? Number(anywhere[1]) : null;
}

/** Maps a stored `failure_reason` to a retry decision plus the agent-facing remedy. */
export function classifyDeliveryFailure(failureReason) {
  const code = parseMetaErrorCode(failureReason);
  if (code === null) return { code: null, ...RETRYABLE_DEFAULT };

  const permanent = PERMANENT_FAILURES[code];
  if (!permanent) return { code, ...RETRYABLE_DEFAULT };

  return { code, retryable: false, ...permanent };
}