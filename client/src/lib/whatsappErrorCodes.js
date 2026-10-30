/**
 * Frontend mirror of backend/src/lib/whatsappErrorCodes.js.
 *
 * Backend is authoritative — it refuses a hopeless retry before any Meta call.
 * This copy exists only so the failed bubble shows the right reason *and* stops
 * offering a Retry button that is guaranteed to fail again.
 *
 * Keep the two tables in sync when adding a code.
 */

export const REMEDY_TEMPLATE = 'template';

const PERMANENT_FAILURES = {
  131047: {
    title: 'The 24-hour customer-care window is closed.',
    remedy: REMEDY_TEMPLATE,
    hint: 'The customer has not replied in the last 24 hours, so WhatsApp only accepts an approved template now.',
  },
  131049: {
    title: 'Meta did not deliver this marketing message.',
    remedy: REMEDY_TEMPLATE,
    hint: 'WhatsApp limited marketing messages to this contact (per-user marketing cap). Wait at least 24 hours before retrying, or ask the contact to message you first. Do not retry immediately.',
  },
  132000: { title: 'This template is paused.', remedy: REMEDY_TEMPLATE, hint: 'Use a different approved template.' },
  132001: { title: 'This template no longer exists.', remedy: REMEDY_TEMPLATE, hint: 'Use a different approved template.' },
  132012: {
    title: 'The template parameters do not match its definition.',
    remedy: REMEDY_TEMPLATE,
    hint: 'Re-pick the template and fill its variables in again.',
  },
  132015: { title: 'This template has been archived.', remedy: REMEDY_TEMPLATE, hint: 'Use a different approved template.' },
};

const RETRYABLE_DEFAULT = {
  retryable: true,
  remedy: 'retry',
  title: 'WhatsApp could not deliver this message.',
  hint: 'This is usually temporary. Try again in a moment.',
};

/** Recovers the Meta code from "(131047) Re-engagement message". */
export function parseMetaErrorCode(failureReason) {
  const text = String(failureReason ?? '');
  const leading = /^\s*\((\d{4,6})\)/.exec(text);
  if (leading) return Number(leading[1]);
  const anywhere = /\((\d{4,6})\)/.exec(text);
  return anywhere ? Number(anywhere[1]) : null;
}

export function classifyDeliveryFailure(failureReason) {
  const code = parseMetaErrorCode(failureReason);
  if (code === null) return { code: null, ...RETRYABLE_DEFAULT };

  const permanent = PERMANENT_FAILURES[code];
  if (!permanent) return { code, ...RETRYABLE_DEFAULT };

  return { code, retryable: false, ...permanent };
}