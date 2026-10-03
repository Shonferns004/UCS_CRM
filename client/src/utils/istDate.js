// IST calendar helpers for the browser.
//
// The client derives month and day keys from the wall clock, while every FRO
// figure it renders is bucketed by the server on the IST calendar (see
// backend/src/utils/ist.js). Between 00:00 and 05:30 IST the two disagree on the
// month, because `new Date().toISOString()` is UTC and therefore still on the
// previous month while IST has already rolled over. The client would then show
// "October" over a September total for the first five and a half hours of every
// month.
//
// These read the IST calendar from the same instant the server does, so the two
// always agree. Kept separate from backend/src/utils/ist.js because that file
// imports the db pool and cannot be bundled into the client.
//
// Every helper here coerces through `new Date(value)` rather than calling
// `value.getTime()` directly, because the callers overwhelmingly pass a STRING:
// an API timestamp like lead.created_at arrives as "2026-10-03T14:22:31+05:30",
// since JSON has no Date type. `new Date(value)` accepts a Date, an ISO string or
// epoch ms; `value.getTime()` only accepts a Date and throws
// "date.getTime is not a function" on the other two. The backend twin already
// coerced with new Date(date), so the two used to disagree on what they accept.
//
// An unparseable value yields null rather than a "NaN-NaN-NaN" key, which sorts
// wrong and reads as a real bucket. Callers already guard for it -- e.g.
// `(istDateOf(l.created_at) || '').slice(0, 7)` in RecruiterOverview.jsx -- and a
// null compares false against any real day key, so an unreadable timestamp drops
// out of the filter instead of breaking the render.
//
// null and '' are rejected explicitly rather than left to new Date(): it maps both
// onto the epoch, so a lead with no created_at would land in a real-looking
// 1970-01-01 bucket and sort ahead of every genuine lead. `undefined` is not
// rejected -- that is the signal for "no argument given", which the default
// parameter turns into now().

const IST_OFFSET_MINUTES = 330;

/** Epoch ms for anything Date accepts, or null when it is not a usable instant. */
function toEpoch(value) {
  if (value === null || value === '') return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

const pad2 = (n) => String(n).padStart(2, '0');

/** The IST calendar date parts for an instant, or null if it is not a valid one. */
export function istParts(date = new Date()) {
  const t = toEpoch(date);
  if (t === null) return null;
  const d = new Date(t + IST_OFFSET_MINUTES * 60 * 1000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/** The IST calendar month a moment belongs to, as 'YYYY-MM', or null. */
export function istMonthKey(date = new Date()) {
  const p = istParts(date);
  return p ? `${p.year}-${pad2(p.month)}` : null;
}

/** The IST calendar day a moment belongs to, as 'YYYY-MM-DD', or null. */
export function istDayKey(date = new Date()) {
  const p = istParts(date);
  return p ? `${p.year}-${pad2(p.month)}-${pad2(p.day)}` : null;
}
