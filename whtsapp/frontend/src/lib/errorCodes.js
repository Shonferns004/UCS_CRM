/**
 * Module 11 — failed bubble par "Retry" dikhana hai ya nahi.
 *
 * Ye `backend/src/lib/whatsapp/errorCodes.js` ka frontend mirror hai. Backend
 * hamesha authoritative hai (wahi retry ko actually rokta hai) — ye sirf isliye
 * hai ki agent ko button dabaane se pehle hi sahi remedy dikhe, 409 ke baad
 * generic error ke saath confuse na ho.
 *
 * Naya code yahan add karte waqt backend wali table se match karein.
 */

export const REMEDY_TEMPLATE = 'template';

const PERMANENT_FAILURES = {
  131047: {
    title: 'The 24-hour customer-care window is closed.',
    remedy: REMEDY_TEMPLATE,
    hint: 'The customer last replied more than 24 hours ago, so WhatsApp only accepts an approved template now.',
  },
  132000: { title: 'This template is paused.', remedy: REMEDY_TEMPLATE, hint: 'Pick a different approved template.' },
  132001: { title: 'This template no longer exists.', remedy: REMEDY_TEMPLATE, hint: 'Pick a different approved template.' },
  132012: {
    title: 'The template parameters do not match its definition.',
    remedy: REMEDY_TEMPLATE,
    hint: 'Re-pick the template and fill its variables in again.',
  },
  132015: { title: 'This template has been archived.', remedy: REMEDY_TEMPLATE, hint: 'Pick a different approved template.' },
};

const RETRYABLE = {
  retryable: true,
  remedy: 'retry',
  title: 'WhatsApp could not deliver this message.',
  hint: 'This is usually temporary. Try again in a moment.',
};

export function classifyDeliveryFailure(errorCode) {
  const code = Number(errorCode);
  if (!Number.isFinite(code) || code === 0) return { code: null, ...RETRYABLE };

  const permanent = PERMANENT_FAILURES[code];
  if (!permanent) return { code, ...RETRYABLE };

  return { code, retryable: false, ...permanent };
}