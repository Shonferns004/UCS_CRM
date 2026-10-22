// telecallerPerformance — the weighted 0-100 performance score shown on the
// NGO-admin Telecaller Performance board.
//
// WHY A SEPARATE MODULE. The score is a weighted blend of five components, each
// of which can be UNAVAILABLE (no target set, no working time, a zero
// denominator). The rules for "what happens when a component cannot be
// computed" are the whole difficulty of this feature, and they must not be
// spread across a controller and a component. So the arithmetic lives here, in
// one pure module with no database access, and the controller only supplies
// the inputs.
//
// THE FORMULA (weights are fixed):
//
//   Performance Score =
//       (Today's Collection Score  × 0.30)
//     + (Leads Done Score         × 0.30)
//     + (Monthly Collection Score × 0.20)
//     + (Connected Calls Score    × 0.10)
//     + (Idle Score               × 0.10)
//
// Every component is scored 0-100 and capped at 100 BEFORE it is weighted.
//
// UNAVAILABLE COMPONENTS. A component whose target is zero or missing cannot be
// scored, so its weight is dropped and the remaining weights are redistributed
// proportionally over the components that CAN be scored. If every component is
// unavailable the score is null (the UI renders an em dash), never 0 — "no
// score" and "a score of zero" are different facts.
//
// IDLE. The idle component is NOT an achievement ratio, so it has its own
// scale: 0% idle scores 100 and 20% idle scores 0. The denominator is the
// eligible logged-in working time, which already excludes approved meetings and
// admin pauses (the ledger counts those as WORKED, not IDLE) and excludes time
// outside the shift.

// The settings model is imported lazily, inside loadPerformanceTargets(), so
// this module stays free of a database dependency. That is what lets the unit
// test import it without booting the pool (and the socket module behind it).

// The weights. Sum = 1.0.
export const PERFORMANCE_WEIGHTS = Object.freeze({
  todayCollection: 0.30,
  leadsDone: 0.30,
  monthlyCollection: 0.20,
  connectedCalls: 0.10,
  idle: 0.10,
});

// Defaults used when a target has never been configured.
//
// daily_lead_target: there is no daily lead target anywhere in the product
// today (the only lead-side target is the monthly collection target), so the
// score needs one. 20 completed leads a day is the proposed default: it sits
// above the daily connected-call target of 200 at a normal ~10% lead_done
// conversion, and it is configurable, so an org that works to a different
// number changes it in Settings rather than in code.
//
// connected_call_target: the default the dashboard has always shown next to the
// Hourly Performance "Target" control (client/src/panels/ngo-admin/pages/
// Dashboard.jsx, DAILY_CONNECTED_TARGET).
export const DEFAULT_DAILY_LEAD_TARGET = 20;
export const DEFAULT_DAILY_CONNECTED_TARGET = 200;

// The score bands. Deliberately only four, and deliberately reusing the
// success/warning/danger tones the rest of the board already uses.
export const PERFORMANCE_BANDS = Object.freeze([
  { min: 90, label: 'Excellent', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  { min: 75, label: 'Good', color: '#166534', bg: '#f7fee7', border: '#d9f99d' },
  { min: 50, label: 'Average', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  { min: 0, label: 'Poor', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
]);

export const COMPONENT_LABELS = Object.freeze({
  todayCollection: "Today's collection",
  leadsDone: 'Leads done',
  monthlyCollection: 'Monthly collection',
  connectedCalls: 'Connected calls',
  idle: 'Idle time',
});

export function performanceBand(score) {
  if (score === null || score === undefined || !Number.isFinite(Number(score))) return null;
  const n = Number(score);
  for (const band of PERFORMANCE_BANDS) {
    if (n >= band.min) return band;
  }
  return PERFORMANCE_BANDS[PERFORMANCE_BANDS.length - 1];
}

export function performanceLabelFor(score) {
  return performanceBand(score)?.label || null;
}

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * An achievement component: score = MIN(100, actual / target × 100).
 *
 * A missing or zero target makes the component UNAVAILABLE (not zero) — there
 * is no denominator to divide by. A valid target with no activity scores 0,
 * because "collected nothing against a real target" is a real result.
 */
function achievementComponent({ key, actual, target, weight, unit }) {
  const a = num(actual);
  const t = num(target);
  if (!Number.isFinite(t) || t <= 0) {
    return {
      key,
      label: COMPONENT_LABELS[key],
      unit,
      weight,
      actual: a,
      target: t > 0 ? t : 0,
      score: null,
      available: false,
      reason: 'no_target',
    };
  }
  const score = clamp(Math.min(100, (a / t) * 100), 0, 100);
  return {
    key,
    label: COMPONENT_LABELS[key],
    unit,
    weight,
    actual: a,
    target: t,
    score,
    available: true,
    reason: null,
  };
}

/**
 * The idle component: 0% idle = 100 points, 20% idle = 0 points.
 *
 * `eligibleWorkingSeconds` is the logged-in working time the idle time is
 * measured against. Zero or missing means the FRO has no eligible working time
 * on record, so the component is unavailable rather than a perfect 100.
 */
function idleComponent({ idleSeconds, eligibleWorkingSeconds, weight }) {
  const idle = Math.max(0, num(idleSeconds));
  const eligible = num(eligibleWorkingSeconds);
  if (!Number.isFinite(eligible) || eligible <= 0) {
    return {
      key: 'idle',
      label: COMPONENT_LABELS.idle,
      unit: 'duration',
      weight,
      actual: idle,
      target: 0,
      score: null,
      available: false,
      reason: 'no_working_time',
    };
  }
  const idlePct = clamp((idle / eligible) * 100, 0, 100);
  const score = clamp(100 - (idlePct / 20) * 100, 0, 100);
  return {
    key: 'idle',
    label: COMPONENT_LABELS.idle,
    unit: 'duration',
    weight,
    actual: idle,
    target: eligible,
    score,
    available: true,
    reason: null,
    idle_pct: idlePct,
  };
}

/**
 * Score one telecaller.
 *
 * `input`:
 *   periodCollection       collection in the selected reporting period (₹)
 *   periodTarget           target for the selected reporting period (₹)
 *   leadsDone              completed leads in the selected reporting period
 *   dailyLeadTarget        daily lead target for the selected period (already
 *                          scaled by the number of working days)
 *   monthlyCollected       collection this month (₹)
 *   monthlyTarget          monthly collection target (₹)
 *   connectedCalls         connected calls in the selected reporting period
 *   dailyConnectedTarget   daily connected-call target for the selected period
 *                           (already scaled by the number of working days)
 *   idleSeconds            idle time in the selected reporting period
 *   eligibleWorkingSeconds eligible logged-in working time in that period
 *
 * Returns { score, label, components[] }. `score` is null when every component
 * is unavailable.
 */
export function scoreTelecaller(input = {}) {
  const components = [
    achievementComponent({
      key: 'todayCollection',
      actual: input.periodCollection,
      target: input.periodTarget,
      weight: PERFORMANCE_WEIGHTS.todayCollection,
      unit: 'amount',
    }),
    achievementComponent({
      key: 'leadsDone',
      actual: input.leadsDone,
      target: input.dailyLeadTarget,
      weight: PERFORMANCE_WEIGHTS.leadsDone,
      unit: 'count',
    }),
    achievementComponent({
      key: 'monthlyCollection',
      actual: input.monthlyCollected,
      target: input.monthlyTarget,
      weight: PERFORMANCE_WEIGHTS.monthlyCollection,
      unit: 'amount',
    }),
    achievementComponent({
      key: 'connectedCalls',
      actual: input.connectedCalls,
      target: input.dailyConnectedTarget,
      weight: PERFORMANCE_WEIGHTS.connectedCalls,
      unit: 'count',
    }),
    idleComponent({
      idleSeconds: input.idleSeconds,
      eligibleWorkingSeconds: input.eligibleWorkingSeconds,
      weight: PERFORMANCE_WEIGHTS.idle,
    }),
  ];

  const available = components.filter((c) => c.available);
  const availableWeight = available.reduce((s, c) => s + c.weight, 0);

  let score = null;
  if (availableWeight > 0) {
    let acc = 0;
    for (const c of available) acc += c.score * (c.weight / availableWeight);
    score = clamp(Math.round(acc), 0, 100);
  }

  return {
    score,
    label: score === null ? null : performanceLabelFor(score),
    components,
    // The weight actually applied to each component after redistribution, so the
    // breakdown table can show it and the total can be re-derived by hand.
    appliedWeights: Object.fromEntries(
      components.map((c) => [
        c.key,
        c.available && availableWeight > 0 ? (c.weight / availableWeight) * 100 : 0,
      ])
    ),
  };
}

function positiveInt(value, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/**
 * The configurable targets the score is measured against.
 *
 * Both live in the `settings` key/value table — the same place the dashboard
 * already stores `connected_call_target` — so they are editable through the
 * existing /settings endpoint and need no new table, no migration and no new
 * tracking mechanism.
 */
export async function loadPerformanceTargets() {
  const { getSetting } = await import('../models/settingsModel.js');
  const [lead, connected] = await Promise.all([
    getSetting('daily_lead_target').catch(() => null),
    getSetting('connected_call_target').catch(() => null),
  ]);
  return {
    daily_lead_target: positiveInt(lead, DEFAULT_DAILY_LEAD_TARGET),
    connected_call_target: positiveInt(connected, DEFAULT_DAILY_CONNECTED_TARGET),
  };
}
