// Per-person late-deduction policy.
//
// One number is stored per worker: late_grace_minutes (NULL = default 180).
// The half-day and full-day limits scale proportionally with the grace so HR
// only ever edits a single value per person.
//
//   factor     = grace / 180
//   halfLimit  = round(240 * factor)
//   fullLimit  = round(480 * factor)   (also the proportional divisor)
//
// Example: grace 100 -> half 133, full 267.
//
// Grace clawback: the free grace stays free only until the pooled total
// crosses the half-day (1-day tier) threshold. From that point the grace is
// charged too — it is added to the total EXACTLY ONCE, never re-added at
// higher tiers. Equivalently: effectiveLate = total + grace, then apply the
// normal tiers/proportional rule to effectiveLate. Because effectiveLate is
// then always past `half`, the tiers collapse into a single proportional
// expression: round((total + grace) / full * 2) / 2.
// Example (grace 180, full 480): 245 -> (245+180)/480 -> 1 day; 720 -> 2 days.
//
// Absences are NOT part of this calculation. An absent day already costs its
// own full day (it is excluded from present days), so charging the month's
// late minutes on top of it would deduct the same absence twice. Lateness is
// therefore judged only on the late minutes actually accumulated.

export const DEFAULT_LATE_GRACE_MINUTES = 180;
const BASE_GRACE = 180;
const BASE_HALF = 240;
const BASE_FULL = 480;

export const MIN_LATE_GRACE_MINUTES = 30;
export const MAX_LATE_GRACE_MINUTES = 480;

export function normalizeLateGrace(value, fallback = DEFAULT_LATE_GRACE_MINUTES) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  if (rounded < MIN_LATE_GRACE_MINUTES || rounded > MAX_LATE_GRACE_MINUTES) return fallback;
  return rounded;
}

export function resolveLateGrace(workerOrValue, fallback = DEFAULT_LATE_GRACE_MINUTES) {
  if (workerOrValue != null && typeof workerOrValue === 'object') {
    const raw = workerOrValue.late_grace_minutes ?? workerOrValue.lateGraceMinutes ?? null;
    if (raw == null || raw === '') return fallback;
    return normalizeLateGrace(raw, fallback);
  }
  if (workerOrValue == null || workerOrValue === '') return fallback;
  return normalizeLateGrace(workerOrValue, fallback);
}

export function getLateThresholds(graceMinutes) {
  const grace = normalizeLateGrace(graceMinutes);
  const factor = grace / BASE_GRACE;
  const half = Math.max(1, Math.round(BASE_HALF * factor));
  const full = Math.max(half + 1, Math.round(BASE_FULL * factor));
  return { grace, half, full };
}

export function calcLateDeductionDays(totalLateMinutes, graceMinutes) {
  const total = Number(totalLateMinutes) || 0;
  const { grace, half, full } = getLateThresholds(graceMinutes);
  if (total <= 0) return 0;
  // Grace clawback: once the 1-day tier is reached the grace is charged too,
  // added exactly once (see header). Never reduces the deduction vs the old
  // tier rule — only shifts every step `grace` minutes earlier.
  if (total > half) return Math.round(((total + grace) / full) * 2) / 2;
  if (total > grace) return 0.5;
  return 0;
}
