// The new Sunday policy — every eligible Sunday is paid, a Sunday is voluntary
// (never late, never half-day) and Sundays earn no AKI — applies from this date
// onward. Months before it keep the old behaviour exactly: the (total − 1)
// free-pool cap, the add-back for a worked but clubbed/cancelled Sunday, late
// and half-day deductions from a Sunday punch, and the Sunday AKI slab.
export const SUNDAY_RULES_FROM = '2026-10-01';

const pad = (n) => String(n).padStart(2, '0');

function weekdayOf(dateStr) {
  if (!dateStr) return -1;
  const dt = new Date(String(dateStr).slice(0, 10) + 'T00:00:00Z');
  const time = dt.getTime();
  return Number.isNaN(time) ? -1 : dt.getUTCDay();
}

// True for a month (0-based) governed by the new Sunday rules.
export function newSundayRules(year, month) {
  return `${year}-${pad(month + 1)}-01` >= SUNDAY_RULES_FROM;
}

// True when this calendar date is a Sunday covered by the new rules: the
// worker may come and go at any time, it is never late and never half-day.
export function isVoluntarySunday(dateStr) {
  return weekdayOf(dateStr) === 0 && String(dateStr).slice(0, 10) >= SUNDAY_RULES_FROM;
}
