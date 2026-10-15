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
// Grace forfeiture (unauthorized absence, Option A single grace budget): an
// absent day with rejected/pending leave (proof rejected or never uploaded)
// — or with no leave at all — forfeits the month's free grace. Whichever
// mechanism arrives first spends the 180, NEVER both. The forfeited path
// charges the grace up-front (eff = total + grace) and runs the PLAIN tier
// ladder on eff — the same 180 the clawback would have taken, just earlier.

export function lateThresholds(graceValue) {
  const n = Number(graceValue);
  const grace = Number.isFinite(n) && n >= 30 && n <= 480 ? Math.round(n) : 180;
  const f = grace / 180;
  const half = Math.max(1, Math.round(240 * f));
  const full = Math.max(half + 1, Math.round(480 * f));
  return { grace, half, full };
}

export function calcLateDeductionDays(totalLateMinutes, graceValue, graceForfeited = false) {
  const total = Number(totalLateMinutes) || 0;
  const { grace, half, full } = lateThresholds(graceValue);
  if (graceForfeited) {
    // Unauthorized absence: grace charged up-front (single budget — the
    // clawback does NOT add it a second time). Plain tier ladder on eff.
    const eff = total + grace;
    if (eff > full) return Math.round((eff / full) * 2) / 2;
    if (eff > half) return 1;
    if (eff > grace) return 0.5;
    return 0;
  }
  if (total <= 0) return 0;
  // Grace clawback: once the 1-day tier is reached the grace is charged too,
  // added exactly once (see header).
  if (total > half) return Math.round(((total + grace) / full) * 2) / 2;
  if (total > grace) return 0.5;
  return 0;
}
