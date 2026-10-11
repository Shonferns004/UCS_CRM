/**
 * Module 11 — kaunsa delivery failure doosri baar bhejne layak hai, aur nahi.
 *
 * Meta har failure par ek numeric code deta hai. In codes mein se kuch permanently
 * fail karte hain — recipient WhatsApp par reachable nahi, ya customer-care window
 * band ho chuki hai. Un par "Retry" ka koi matlab nahi: wahi free-form payload
 * Meta phir se reject karega, har baar, aur har attempt ek wasted API call hai.
 *
 * Isi liye retry se pehle code dekha jaata hai aur agent ko remedy dikhaya jaata
 * hai, failure ko chupane ke bajaye.
 *
 * Default `retryable: true` hai. Koi naya ya unknown code aaye to purana behaviour
 * (retry) hi chalta rahe — zyadatar failures transient hote hain (network drop,
 * 5xx, rate limit) aur unme doosra attempt sahi hota hai.
 */

/** `template` = agent ko approved template bhejna padega; koi retry kaam nahi karega. */
export const REMEDY_TEMPLATE = 'template';

const PERMANENT_FAILURES = new Map([
  [
    131047,
    {
      title: 'The 24-hour customer-care window is closed.',
      remedy: REMEDY_TEMPLATE,
      hint:
        'The customer last replied more than 24 hours ago, so WhatsApp only accepts an approved template now. ' +
        'Send one from the Template Library — retrying this text cannot succeed.',
    },
  ],
  // ── Template payload ke permanent problems: wahi template dobara bhejne se
  //    kuch nahi badlega, template hi badalna padega.
  [
    132000,
    {
      title: 'This template is paused.',
      remedy: REMEDY_TEMPLATE,
      hint: 'Meta has paused this template. Pick a different approved template, or have this one reinstated.',
    },
  ],
  [
    132001,
    {
      title: 'This template no longer exists.',
      remedy: REMEDY_TEMPLATE,
      hint: 'The template was deleted from the Meta account. Pick a different approved template.',
    },
  ],
  [
    132012,
    {
      title: 'The template parameters do not match its definition.',
      remedy: REMEDY_TEMPLATE,
      hint: 'The template expects different variables than the ones stored on this message. Re-pick the template and fill its variables in again.',
    },
  ],
  [
    132015,
    {
      title: 'This template has been archived.',
      remedy: REMEDY_TEMPLATE,
      hint: 'The template was archived in the Meta account. Pick a different approved template.',
    },
  ],
]);

/**
 * Jo failure codes jaan-boojh kar nahi rakhe gaye — 131026 ("message undeliverable")
 * unme se hai. Woh kai alag halaat ko cover karta hai (number WhatsApp par nahi,
 * recipient ne block kiya, carrier bounce) aur ek baar fail hua message baad me
 * kabhi-kabhi deliver ho jata hai, isliye use retryable chhodha gaya hai.
 */
const TRANSIENT_DEFAULTS = {
  retryable: true,
  remedy: 'retry',
  title: 'WhatsApp could not deliver this message.',
  hint: 'This is usually temporary. Try again in a moment.',
};

/**
 * Ek stored `error_code` (ya koi bhi truthy code) ko retry decision me badalta hai.
 * Unknown / null code hamesha retryable hai — pehle jaisa behaviour.
 */
export function classifyDeliveryFailure(errorCode) {
  const code = Number(errorCode);
  if (!Number.isFinite(code) || code === 0) return { code: null, ...TRANSIENT_DEFAULTS };

  const permanent = PERMANENT_FAILURES.get(code);
  if (!permanent) return { code, ...TRANSIENT_DEFAULTS };

  return { code, retryable: false, ...permanent };
}

/** `true` jab retry karna bekaar hai — Meta wahi payload phir se reject karega. */
export function isRetryableFailure(errorCode) {
  return classifyDeliveryFailure(errorCode).retryable;
}