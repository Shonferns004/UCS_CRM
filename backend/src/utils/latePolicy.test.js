import test from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_LATE_GRACE_MINUTES,
  MIN_LATE_GRACE_MINUTES,
  MAX_LATE_GRACE_MINUTES,
  normalizeLateGrace,
  resolveLateGrace,
  getLateThresholds,
  calcLateDeductionDays,
} from './latePolicy.js';

// The formula under test (see header comment in latePolicy.js):
//   total <= grace          -> 0
//   grace < total <= half   -> 0.5
//   total > half            -> round((total + grace) / full * 2) / 2
// The grace is clawed back EXACTLY ONCE when the 1-day tier is crossed.

// --- constants & helpers -----------------------------------------------------

test('constants', () => {
  assert.equal(DEFAULT_LATE_GRACE_MINUTES, 180);
  assert.equal(MIN_LATE_GRACE_MINUTES, 30);
  assert.equal(MAX_LATE_GRACE_MINUTES, 480);
});

test('getLateThresholds scales proportionally with grace', () => {
  assert.deepEqual(getLateThresholds(180), { grace: 180, half: 240, full: 480 });
  assert.deepEqual(getLateThresholds(100), { grace: 100, half: 133, full: 267 });
  assert.deepEqual(getLateThresholds(30), { grace: 30, half: 40, full: 80 });
  assert.deepEqual(getLateThresholds(90), { grace: 90, half: 120, full: 240 });
  assert.deepEqual(getLateThresholds(480), { grace: 480, half: 640, full: 1280 });
  // invalid / missing grace falls back to the default
  assert.deepEqual(getLateThresholds(null), { grace: 180, half: 240, full: 480 });
  assert.deepEqual(getLateThresholds(9999), { grace: 180, half: 240, full: 480 });
});

test('normalizeLateGrace / resolveLateGrace', () => {
  assert.equal(normalizeLateGrace('250'), 250);
  assert.equal(normalizeLateGrace(30.7), 31);
  assert.equal(normalizeLateGrace(25.7), 180); // rounds to 26, below min -> fallback
  assert.equal(normalizeLateGrace(10), 180); // below min -> fallback
  assert.equal(normalizeLateGrace(500), 180); // above max -> fallback
  assert.equal(normalizeLateGrace('abc'), 180);
  assert.equal(resolveLateGrace(null), 180);
  assert.equal(resolveLateGrace(''), 180);
  assert.equal(resolveLateGrace({ late_grace_minutes: null }), 180);
  assert.equal(resolveLateGrace({ late_grace_minutes: 300 }), 300);
  assert.equal(resolveLateGrace({ lateGraceMinutes: 90 }), 90);
});

// --- tiers below the clawback are unchanged ----------------------------------

test('within grace -> 0', () => {
  assert.equal(calcLateDeductionDays(0, 180), 0);
  assert.equal(calcLateDeductionDays(1, 180), 0);
  assert.equal(calcLateDeductionDays(180, 180), 0); // exact grace is free
  assert.equal(calcLateDeductionDays(-5, 180), 0);
  assert.equal(calcLateDeductionDays(undefined, 180), 0);
});

test('grace < total <= half -> flat 0.5', () => {
  assert.equal(calcLateDeductionDays(181, 180), 0.5);
  assert.equal(calcLateDeductionDays(200, 180), 0.5);
  assert.equal(calcLateDeductionDays(240, 180), 0.5); // exact half still 0.5
  assert.equal(calcLateDeductionDays(40, 30), 0.5); // grace 30, half 40
  assert.equal(calcLateDeductionDays(120, 90), 0.5); // grace 90, half 120
});

// --- clawback: crossing the 1-day tier ---------------------------------------

test('crossing the half-day tier starts at 1.0 (never dips back to 0.5)', () => {
  assert.equal(calcLateDeductionDays(241, 180), 1);
  assert.equal(calcLateDeductionDays(41, 30), 1);
  assert.equal(calcLateDeductionDays(121, 90), 1);
  assert.equal(calcLateDeductionDays(641, 480), 1);
});

test('default grace 180: clawback boundaries', () => {
  // (total + 180) / 480 rounded to nearest 0.5
  assert.equal(calcLateDeductionDays(241, 180), 1); // 421/480 -> 1.0
  assert.equal(calcLateDeductionDays(419, 180), 1); // 599/480 -> 1.0
  assert.equal(calcLateDeductionDays(420, 180), 1.5); // 600/480 = 1.25 -> rounds UP to 1.5
  assert.equal(calcLateDeductionDays(480, 180), 1.5); // 660/480
  assert.equal(calcLateDeductionDays(481, 180), 1.5); // 661/480
  assert.equal(calcLateDeductionDays(659, 180), 1.5); // 839/480
  assert.equal(calcLateDeductionDays(660, 180), 2); // 840/480 = 1.75 -> 2.0
  assert.equal(calcLateDeductionDays(720, 180), 2); // 900/480
  assert.equal(calcLateDeductionDays(899, 180), 2); // 1079/480
  assert.equal(calcLateDeductionDays(900, 180), 2.5); // 1080/480 = 2.25 -> 2.5
  assert.equal(calcLateDeductionDays(960, 180), 2.5); // 1140/480
});

test('grace is added ONCE, never compounded per tier', () => {
  // 720 min with grace 180: (720 + 180) / 480 = 1.875 -> 2.0.
  // If grace were re-added at each tier crossed it would be
  // (720 + 180 + 180) / 480 = 2.25 -> 2.5 — must NOT happen.
  assert.equal(calcLateDeductionDays(720, 180), 2);
  assert.equal(calcLateDeductionDays(960, 180), 2.5); // not 3
  assert.equal(calcLateDeductionDays(1440, 180), 3.5); // (1440+180)/480 = 3.375 -> 3.5
});

test('clawback scales with per-person grace', () => {
  // grace 30 -> half 40, full 80
  assert.equal(calcLateDeductionDays(70, 30), 1.5); // 100/80 = 1.25 -> 1.5
  assert.equal(calcLateDeductionDays(160, 30), 2.5); // 190/80 = 2.375 -> 2.5
  // grace 90 -> half 120, full 240
  assert.equal(calcLateDeductionDays(210, 90), 1.5); // 300/240 = 1.25 -> 1.5
  assert.equal(calcLateDeductionDays(360, 90), 2); // 450/240 = 1.875 -> 2.0
  // grace 480 -> half 640, full 1280
  assert.equal(calcLateDeductionDays(1200, 480), 1.5); // 1680/1280 = 1.3125 -> 1.5
});

// --- invariants --------------------------------------------------------------

function oldCalc(total, graceMinutes) {
  const { grace, half, full } = getLateThresholds(graceMinutes);
  if (total > full) return Math.round((total / full) * 2) / 2;
  if (total > half) return 1;
  if (total > grace) return 0.5;
  return 0;
}

test('invariant: new rule never reduces the deduction vs the old rule', () => {
  for (const grace of [30, 90, 180, 300, 480]) {
    for (let total = 0; total <= 2000; total += 7) {
      const next = calcLateDeductionDays(total, grace);
      const old = oldCalc(total, grace);
      assert.ok(
        next >= old - 1e-9,
        `grace=${grace} total=${total}: new ${next} < old ${old}`,
      );
    }
  }
});

test('invariant: always a multiple of 0.5', () => {
  for (const grace of [30, 90, 180, 480]) {
    for (let total = 0; total <= 2000; total += 13) {
      const days = calcLateDeductionDays(total, grace);
      assert.equal(days * 2, Math.round(days * 2), `grace=${grace} total=${total}`);
    }
  }
});

test('invariant: past the half-day tier the deduction is at least 1', () => {
  for (const grace of [30, 90, 180, 480]) {
    const { half } = getLateThresholds(grace);
    for (let total = half + 1; total <= half + 500; total += 3) {
      const days = calcLateDeductionDays(total, grace);
      assert.ok(days >= 1, `grace=${grace} total=${total}: ${days} < 1`);
    }
  }
});

// --- grace forfeiture (unauthorized absence, Option A) ------------------------
// Forfeited path: eff = total + grace, then the PLAIN tier ladder on eff.
// The clawback does NOT add the grace a second time (single 180 budget).

test('forfeited: grace charged up-front on the plain ladder', () => {
  const f = (t, g = 180) => calcLateDeductionDays(t, g, { graceForfeited: true });
  assert.equal(f(0), 0); // eff 180 <= grace -> 0 (absent day itself is the cost)
  assert.equal(f(1), 0.5); // eff 181 -> past grace, within half
  assert.equal(f(60), 0.5); // eff 240 -> exact half still 0.5
  assert.equal(f(61), 1); // eff 241 -> 1-day tier
  assert.equal(f(100), 1); // eff 280 -> 1.0 (matches the walkthrough table)
  assert.equal(f(250), 1); // eff 430 -> 1.0 (Priya: same as clawback)
  assert.equal(f(300), 1); // eff 480 -> exact full still 1.0
  assert.equal(f(301), 1); // eff 481 -> 481/480 rounds to 2 halves -> still 1.0
  assert.equal(f(420), 1.5); // eff 600 -> 2.5 -> rounds up to 3 halves -> 1.5
  assert.equal(f(500), 1.5); // eff 680 -> round(680/480*2)/2 = 1.5
  assert.equal(f(720), 2); // eff 900 -> 1.875 -> 2.0
});

test('forfeited vs clawback: never double-charges the 180 (single budget)', () => {
  // Past the half tier both paths compute the same value — the galti adds
  // nothing on top of what the clawback would already have charged.
  assert.equal(calcLateDeductionDays(250, 180, { graceForfeited: true }), calcLateDeductionDays(250, 180));
  assert.equal(calcLateDeductionDays(500, 180, { graceForfeited: true }), 1.5); // clawback alone: (680)/480 -> 1.5
  assert.equal(calcLateDeductionDays(1000, 180, { graceForfeited: true }), 2.5);
  assert.equal(calcLateDeductionDays(1000, 180), 2.5);
});

test('forfeited only ever increases the deduction (never reduces)', () => {
  for (const grace of [30, 90, 180, 480]) {
    for (let total = 0; total <= 2000; total += 7) {
      const plain = calcLateDeductionDays(total, grace);
      const forfeited = calcLateDeductionDays(total, grace, { graceForfeited: true });
      assert.ok(
        forfeited >= plain - 1e-9,
        `grace=${grace} total=${total}: forfeited ${forfeited} < plain ${plain}`,
      );
      assert.equal(forfeited * 2, Math.round(forfeited * 2), `not a multiple of 0.5: grace=${grace} total=${total}`);
    }
  }
});

test('forfeited scales with per-person grace', () => {
  // grace 90 -> half 120, full 240
  assert.equal(calcLateDeductionDays(0, 90, { graceForfeited: true }), 0);
  assert.equal(calcLateDeductionDays(30, 90, { graceForfeited: true }), 0.5); // eff 120 -> exact half
  assert.equal(calcLateDeductionDays(31, 90, { graceForfeited: true }), 1); // eff 121 -> 1
  assert.equal(calcLateDeductionDays(150, 90, { graceForfeited: true }), 1); // eff 240 -> exact full -> 1
  assert.equal(calcLateDeductionDays(210, 90, { graceForfeited: true }), 1.5); // eff 300 -> 300/240 -> 1.5
  // grace 30 -> half 40, full 80
  assert.equal(calcLateDeductionDays(11, 30, { graceForfeited: true }), 1); // eff 41 -> 1
});
