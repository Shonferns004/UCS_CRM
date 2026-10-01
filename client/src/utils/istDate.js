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

const IST_OFFSET_MINUTES = 330;

/** The IST calendar date parts for an instant. */
export function istParts(date = new Date()) {
  const d = new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/** The IST calendar month a moment belongs to, as 'YYYY-MM'. */
export function istMonthKey(date = new Date()) {
  const { year, month } = istParts(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** The IST calendar day a moment belongs to, as 'YYYY-MM-DD'. */
export function istDayKey(date = new Date()) {
  const { year, month, day } = istParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}