// Per-person late policy — mirrors backend/src/utils/latePolicy.js.
// Only the grace is stored per worker (late_grace_minutes, NULL = 180);
// the half/full limits scale proportionally with it:
//   factor    = grace / 180
//   halfLimit = round(240 * factor)
//   fullLimit = round(480 * factor)  (also the proportional divisor)
//
// Grace clawback: the free grace stays free only until the pooled total
// crosses the half-day (1-day) tier. From then on the grace is charged too —
// added EXACTLY ONCE, never re-added at higher tiers. Equivalently:
// effectiveLate = total + grace, then the proportional rule on effectiveLate.
//
// Absences are deliberately NOT part of this calculation: an absent day
// already costs its own full day, so charging the month's late minutes on top
// of it would deduct the same absence twice.

export function lateThresholds(graceValue) {
  const n = Number(graceValue);
  const grace = Number.isFinite(n) && n >= 30 && n <= 480 ? Math.round(n) : 180;
  const f = grace / 180;
  const half = Math.max(1, Math.round(240 * f));
  const full = Math.max(half + 1, Math.round(480 * f));
  return { grace, half, full };
}

export function calcLateDeductionDays(totalLateMinutes, graceValue) {
  const total = Number(totalLateMinutes) || 0;
  const { grace, half, full } = lateThresholds(graceValue);
  if (total <= 0) return 0;
  // Grace clawback: once the 1-day tier is reached the grace is charged too,
  // added exactly once (see header).
  if (total > half) return Math.round(((total + grace) / full) * 2) / 2;
  if (total > grace) return 0.5;
  return 0;
}
