/**
 * Tests for the Telecaller Performance score.
 *
 * The score is the one number on the admin board that is computed rather than
 * read, so its edge cases are the whole risk:
 *
 *   1. target achievement and the 100-point cap
 *   2. a missing / zero target -> the component is dropped and its weight is
 *      redistributed over the components that remain
 *   3. every component unavailable -> the score is null, never 0
 *   4. the idle scale (0% -> 100, 5% -> 75, 10% -> 50, 15% -> 25, 20% -> 0)
 *   5. no negative scores, no score above 100
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PERFORMANCE_WEIGHTS,
  DEFAULT_DAILY_LEAD_TARGET,
  DEFAULT_DAILY_CONNECTED_TARGET,
  scoreTelecaller,
  performanceLabelFor,
} from './telecallerPerformance.js';

const comp = (result, key) => result.components.find((c) => c.key === key);

// A fully "good" input: every target met, no idle.
const goodInput = () => ({
  periodCollection: 5000,
  periodTarget: 5000,
  leadsDone: 20,
  dailyLeadTarget: 20,
  monthlyCollected: 50000,
  monthlyTarget: 50000,
  connectedCalls: 200,
  dailyConnectedTarget: 200,
  idleSeconds: 0,
  eligibleWorkingSeconds: 28800,
});

test('weights sum to 1', () => {
  const total = Object.values(PERFORMANCE_WEIGHTS).reduce((s, w) => s + w, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `weights sum to ${total}`);
});

test('a fully met target set scores 100 / Excellent', () => {
  const r = scoreTelecaller(goodInput());
  assert.equal(r.score, 100);
  assert.equal(r.label, 'Excellent');
});

test('every component is capped at 100', () => {
  const r = scoreTelecaller({
    ...goodInput(),
    periodCollection: 999999,
    leadsDone: 9999,
    monthlyCollected: 999999,
    connectedCalls: 99999,
  });
  for (const c of r.components) {
    assert.ok(c.score <= 100, `${c.key} scored ${c.score}`);
  }
  assert.equal(r.score, 100);
});

test('achievement score is actual/target x 100', () => {
  const r = scoreTelecaller({ ...goodInput(), periodCollection: 2500, periodTarget: 5000 });
  assert.equal(comp(r, 'todayCollection').score, 50);
});

test('a component with a valid target and no activity scores 0, not unavailable', () => {
  const r = scoreTelecaller({ ...goodInput(), leadsDone: 0 });
  const c = comp(r, 'leadsDone');
  assert.equal(c.available, true);
  assert.equal(c.score, 0);
});

test('a zero target makes the component unavailable and drops its weight', () => {
  const r = scoreTelecaller({ ...goodInput(), dailyLeadTarget: 0 });
  const c = comp(r, 'leadsDone');
  assert.equal(c.available, false);
  assert.equal(c.score, null);
  assert.equal(c.reason, 'no_target');

  // The other four components are all 100, so the redistributed score is still
  // 100 — and the applied weight on leadsDone is zero.
  assert.equal(r.score, 100);
  assert.equal(r.appliedWeights.leadsDone, 0);
  // 70% of the weight is left, spread over the four surviving components in
  // proportion to their own weights: 30/70, 20/70, 10/70 and 10/70.
  const expected = {
    todayCollection: (30 / 70) * 100,
    monthlyCollection: (20 / 70) * 100,
    connectedCalls: (10 / 70) * 100,
    idle: (10 / 70) * 100,
  };
  for (const [key, w] of Object.entries(expected)) {
    assert.ok(Math.abs(r.appliedWeights[key] - w) < 1e-9, `${key} weight ${r.appliedWeights[key]} != ${w}`);
  }
});

test('a missing target is treated the same as a zero target', () => {
  const r = scoreTelecaller({ ...goodInput(), dailyLeadTarget: undefined, monthlyTarget: null });
  assert.equal(comp(r, 'leadsDone').available, false);
  assert.equal(comp(r, 'monthlyCollection').available, false);
  assert.equal(r.score, 100);
});

test('the remaining weights are redistributed proportionally, not re-spread evenly', () => {
  // Idle unavailable (30% + 30% + 20% + 10% = 90% of the weight available).
  const r = scoreTelecaller({ ...goodInput(), eligibleWorkingSeconds: 0 });
  assert.equal(comp(r, 'idle').available, false);
  assert.ok(Math.abs(r.appliedWeights.todayCollection - (30 / 90) * 100) < 1e-9);
  assert.ok(Math.abs(r.appliedWeights.leadsDone - (30 / 90) * 100) < 1e-9);
  assert.ok(Math.abs(r.appliedWeights.monthlyCollection - (20 / 90) * 100) < 1e-9);
  assert.ok(Math.abs(r.appliedWeights.connectedCalls - (10 / 90) * 100) < 1e-9);
  assert.equal(r.appliedWeights.idle, 0);
});

test('when every component is unavailable the score is null, not 0', () => {
  const r = scoreTelecaller({
    periodCollection: 0,
    periodTarget: 0,
    leadsDone: 0,
    dailyLeadTarget: 0,
    monthlyCollected: 0,
    monthlyTarget: 0,
    connectedCalls: 0,
    dailyConnectedTarget: 0,
    idleSeconds: 0,
    eligibleWorkingSeconds: 0,
  });
  assert.equal(r.score, null);
  assert.equal(r.label, null);
  for (const c of r.components) assert.equal(c.available, false);
});

test('idle scale: 0% -> 100, 5% -> 75, 10% -> 50, 15% -> 25, 20% -> 0', () => {
  const at = (pct) => {
    const eligible = 10000;
    const r = scoreTelecaller({ ...goodInput(), idleSeconds: (eligible * pct) / 100, eligibleWorkingSeconds: eligible });
    const c = comp(r, 'idle');
    assert.equal(c.available, true);
    assert.ok(Math.abs(c.idle_pct - pct) < 1e-9);
    return c.score;
  };
  assert.ok(Math.abs(at(0) - 100) < 1e-9);
  assert.ok(Math.abs(at(5) - 75) < 1e-9);
  assert.ok(Math.abs(at(10) - 50) < 1e-9);
  assert.ok(Math.abs(at(15) - 25) < 1e-9);
  assert.ok(Math.abs(at(20) - 0) < 1e-9);
  // Beyond 20% idle the score floors at 0 and never goes negative.
  assert.equal(at(40), 0);
  assert.equal(at(100), 0);
});

test('no eligible working time makes the idle component unavailable', () => {
  const r = scoreTelecaller({ ...goodInput(), idleSeconds: 3600, eligibleWorkingSeconds: 0 });
  const c = comp(r, 'idle');
  assert.equal(c.available, false);
  assert.equal(c.reason, 'no_working_time');
  assert.equal(c.score, null);
});

test('idle above the eligible working time is clamped to a 0 score, not a negative one', () => {
  const r = scoreTelecaller({ ...goodInput(), idleSeconds: 50000, eligibleWorkingSeconds: 10000 });
  const c = comp(r, 'idle');
  assert.equal(c.score, 0);
  assert.ok(c.idle_pct <= 100);
});

test('the final score is never negative and never above 100', () => {
  const r = scoreTelecaller({
    periodCollection: -500,
    periodTarget: 500,
    leadsDone: -10,
    dailyLeadTarget: 20,
    monthlyCollected: -1,
    monthlyTarget: 100,
    connectedCalls: -5,
    dailyConnectedTarget: 200,
    idleSeconds: -100,
    eligibleWorkingSeconds: 100,
  });
  assert.ok(r.score >= 0 && r.score <= 100, `score ${r.score}`);
  assert.equal(comp(r, 'todayCollection').score, 0);
  // Negative idle is not "negative idle", it is no idle at all.
  assert.equal(comp(r, 'idle').score, 100);
});

test('null / undefined / NaN inputs are handled safely', () => {
  const r = scoreTelecaller({
    periodCollection: null,
    periodTarget: undefined,
    leadsDone: NaN,
    dailyLeadTarget: 'abc',
    monthlyCollected: undefined,
    monthlyTarget: null,
    connectedCalls: null,
    dailyConnectedTarget: undefined,
    idleSeconds: null,
    eligibleWorkingSeconds: undefined,
  });
  assert.equal(r.score, null);
  assert.ok(r.components.length === 5);
});

test('the weighted total matches a hand calculation', () => {
  // collection 50, leads 100, monthly 50, calls 0, idle 100
  const r = scoreTelecaller({
    periodCollection: 500,
    periodTarget: 1000,
    leadsDone: 20,
    dailyLeadTarget: 20,
    monthlyCollected: 500,
    monthlyTarget: 1000,
    connectedCalls: 0,
    dailyConnectedTarget: 200,
    idleSeconds: 0,
    eligibleWorkingSeconds: 28800,
  });
  // 50*.30 + 100*.30 + 50*.20 + 0*.10 + 100*.10 = 15 + 30 + 10 + 0 + 10 = 65
  assert.equal(r.score, 65);
  assert.equal(r.label, 'Average');
});

test('score bands are 90 Excellent, 75 Good, 50 Average, else Poor', () => {
  assert.equal(performanceLabelFor(100), 'Excellent');
  assert.equal(performanceLabelFor(90), 'Excellent');
  assert.equal(performanceLabelFor(89), 'Good');
  assert.equal(performanceLabelFor(75), 'Good');
  assert.equal(performanceLabelFor(74), 'Average');
  assert.equal(performanceLabelFor(50), 'Average');
  assert.equal(performanceLabelFor(49), 'Poor');
  assert.equal(performanceLabelFor(0), 'Poor');
});

test('the documented defaults are exposed', () => {
  assert.equal(DEFAULT_DAILY_LEAD_TARGET, 20);
  assert.equal(DEFAULT_DAILY_CONNECTED_TARGET, 200);
});
