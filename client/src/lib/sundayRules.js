// New Sunday policy — a Sunday is voluntary (never late, never half-day), every
// eligible Sunday is paid and Sundays earn no AKI — applies from this date
// onward. Months before it keep the old behaviour (the total-1 free pool, a
// worked-but-cancelled Sunday paid back, Sunday late deductions, Sunday AKI).
// Keep in sync with backend/src/utils/sundayRules.js.
export const SUNDAY_RULES_FROM = '2026-10-01';

const pad2 = (n) => String(n).padStart(2, '0');

// True for a month (1-based) governed by the new Sunday rules.
export function newSundayRulesMonth(year, month) {
  return `${year}-${pad2(month)}-01` >= SUNDAY_RULES_FROM;
}

// True when this calendar date is a Sunday covered by the new rules.
export function isVoluntarySunday(dateStr) {
  if (!dateStr) return false;
  const day = String(dateStr).slice(0, 10);
  const dt = new Date(`${day}T00:00:00Z`);
  const time = dt.getTime();
  return !Number.isNaN(time) && dt.getUTCDay() === 0 && day >= SUNDAY_RULES_FROM;
}
