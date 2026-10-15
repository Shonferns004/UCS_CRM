// Range bucketing: which incentive range does a FRO's monthly target land in?
//
// This file exists because of a live production bug. The first implementation
// compared `t >= min && t < max` — an EXCLUSIVE upper bound. Admins define
// ranges inclusively ("₹70000 – ₹100000", "₹100001 – ₹200000"), so a target
// sitting exactly on a range's max_amount matched no range at all and fell into
// the final "first slab" fallback. The day it shipped, a FRO with a ₹2,00,000
// monthly target — exactly the max of the ₹100001–₹200000 range — appeared in
// the ₹1 – ₹29,999 bottom race, along with two ₹1,00,000-target FROs (max of
// ₹70000–₹100000). Three FROs, all dumped into the lowest range.
//
// The exact-boundary cases below are the regression lock: if anyone restores
// `t < max`, they fail immediately.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getSlabForTarget, resolveFroSlab } from './leadIncentiveSlabBucketing.js';

// The LIVE range configuration from production on 14 Oct 2026, sorted by
// min_amount exactly as getActiveSlabs() returns them. Note the intentional
// gap between ₹200000 and ₹250000.
const SLABS = [
  { id: 's1', min_amount: 1, max_amount: 29999 },
  { id: 's2', min_amount: 30000, max_amount: 69999 },
  { id: 's3', min_amount: 70000, max_amount: 100000 },
  { id: 's4', min_amount: 100001, max_amount: 200000 },
  { id: 's5', min_amount: 250000, max_amount: 450000 },
];
const byId = Object.fromEntries(SLABS.map(s => [s.id, s]));

test('REGRESSION: a target exactly on a range max lands IN that range, not the first slab', () => {
  // This is the ₹2,00,000 / Pooja Pal case that shipped broken. With `t < max`
  // it matched nothing and fell to s1 (₹1–29999).
  assert.equal(getSlabForTarget(200000, SLABS).id, 's4');
  // The same trap two ranges down: ₹1,00,000 is the max of s3.
  assert.equal(getSlabForTarget(100000, SLABS).id, 's3');
  // And at every other upper boundary in the live config.
  assert.equal(getSlabForTarget(29999, SLABS).id, 's1');
  assert.equal(getSlabForTarget(69999, SLABS).id, 's2');
  assert.equal(getSlabForTarget(450000, SLABS).id, 's5');
});

test('REGRESSION: the three mis-bucketed live FROs resolve to their correct ranges', () => {
  // Resolved targets of the three FROs that were wrongly shown under
  // ₹1 – ₹29,999 on 14 Oct 2026.
  const misBucketed = [
    { target: 200000, expect: 's4', who: 'Pooja Pal (₹2L)' },
    { target: 100000, expect: 's3', who: 'Chhaya Kumari (₹1L)' },
    { target: 100000, expect: 's3', who: 'Mittal Bharwad (₹1L)' },
  ];
  for (const { target, expect, who } of misBucketed) {
    assert.equal(getSlabForTarget(target, SLABS).id, expect, who);
  }
});

test('range lower bounds and mid-range targets land in the right range', () => {
  assert.equal(getSlabForTarget(1, SLABS).id, 's1');
  assert.equal(getSlabForTarget(30000, SLABS).id, 's2');   // lower bound inclusive
  assert.equal(getSlabForTarget(70000, SLABS).id, 's3');
  assert.equal(getSlabForTarget(100001, SLABS).id, 's4');
  assert.equal(getSlabForTarget(250000, SLABS).id, 's5');
  assert.equal(getSlabForTarget(33000, SLABS).id, 's2');   // live: Ankita Chavan
  assert.equal(getSlabForTarget(135000, SLABS).id, 's4');  // live: Hiral Waghela
  assert.equal(getSlabForTarget(350000, SLABS).id, 's5');  // live: Neha Kharwar
});

test('a target ABOVE every range goes to the highest range', () => {
  assert.equal(getSlabForTarget(500000, SLABS).id, 's5');
  assert.equal(getSlabForTarget(1000000, SLABS).id, 's5');
});

test('REGRESSION: upper bound is inclusive even when two ranges SHARE a boundary', () => {
  // Ranges that touch (allowed by the controller's overlap check: max > other.min
  // is false when max == other.min). With an exclusive `t < max` this target
  // would skip the lower range and land in the upper one — proving the
  // comparison itself is inclusive, not just rescued by the nearest fallback.
  const touching = [
    { id: 'low', min_amount: 1, max_amount: 30000 },
    { id: 'high', min_amount: 30000, max_amount: 70000 },
  ];
  assert.equal(getSlabForTarget(30000, touching).id, 'low');
  assert.equal(getSlabForTarget(29999, touching).id, 'low');
  assert.equal(getSlabForTarget(30001, touching).id, 'high');
});

test('a target in a GAP goes to the NEAREST range, never automatically the lowest', () => {
  // The live config has a real gap: 200001–249999 is covered by no range.
  // 2,20,000 is 20k above s4 and 30k below s5 → s4 is nearer.
  assert.equal(getSlabForTarget(220000, SLABS).id, 's4');
  // 2,40,000 is 40k above s4 and 10k below s5 → s5 is nearer.
  assert.equal(getSlabForTarget(240000, SLABS).id, 's5');
  // A target below the lowest range goes to the lowest range (nearest below).
  assert.equal(getSlabForTarget(0, SLABS).id, 's1');
});

test('string amounts from numeric columns still bucket correctly', () => {
  // pg numeric columns can arrive as strings depending on the type parser.
  assert.equal(getSlabForTarget('200000', SLABS).id, 's4');
  assert.equal(getSlabForTarget('100000', SLABS).id, 's3');
});

test('empty / missing inputs return null instead of throwing', () => {
  assert.equal(getSlabForTarget(200000, []), null);
  assert.equal(getSlabForTarget(200000, null), null);
  assert.equal(getSlabForTarget(undefined, SLABS).id, 's1'); // 0 → nearest below = s1
});

test('resolveFroSlab: an explicit admin assignment overrides target bucketing', () => {
  const assignMap = { fro1: 's5' };
  const r = resolveFroSlab('fro1', 50000, SLABS, assignMap, byId);
  assert.equal(r.slab.id, 's5');
  assert.equal(r.target, 50000);
});

test('resolveFroSlab: an assignment to a DELETED range falls back to the target range', () => {
  const assignMap = { fro1: 'deleted-slab' };
  const r = resolveFroSlab('fro1', 200000, SLABS, assignMap, byId);
  assert.equal(r.slab.id, 's4');
});

test('resolveFroSlab: unassigned FROs bucket by target (inclusive max)', () => {
  const r = resolveFroSlab('fro2', 200000, SLABS, {}, byId);
  assert.equal(r.slab.id, 's4');
});
