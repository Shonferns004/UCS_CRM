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
// Grace forfeiture (unauthorized absence): an absent day with a rejected or
// pending leave (proof rejected / never uploaded) — or with no leave at all —
// forfeits the month's free grace. Same single 180 budget as the clawback:
// whichever mechanism arrives first spends it, NEVER both (Option A). The
// forfeited path charges the grace up-front (eff = total + grace) and then
// runs the PLAIN tier ladder on eff — the same 180 the clawback would have
// taken, just earlier. Example (grace 180): total 100 -> eff 280 -> 1.0 day
// (vs 0 without the galti); total 250 -> eff 430 -> 1.0 (same as clawback).

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

export function calcLateDeductionDays(totalLateMinutes, graceMinutes, opts = {}) {
  const total = Number(totalLateMinutes) || 0;
  const { grace, half, full } = getLateThresholds(graceMinutes);
  if (opts.graceForfeited) {
    // Unauthorized absence: the grace is charged up-front (single budget —
    // the clawback does NOT add it a second time). Plain tier ladder on the
    // charged total, exactly as before the clawback existed.
    const eff = total + grace;
    if (eff > full) return Math.round((eff / full) * 2) / 2;
    if (eff > half) return 1;
    if (eff > grace) return 0.5;
    return 0;
  }
  if (total <= 0) return 0;
  // Grace clawback: once the 1-day tier is reached the grace is charged too,
  // added exactly once (see header). Never reduces the deduction vs the old
  // tier rule — only shifts every step `grace` minutes earlier.
  if (total > half) return Math.round(((total + grace) / full) * 2) / 2;
  if (total > grace) return 0.5;
  return 0;
}
