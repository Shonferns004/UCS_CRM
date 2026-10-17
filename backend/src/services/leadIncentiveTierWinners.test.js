// Tier-winner selection: who wins each milestone tier in a range?
//
// This file exists because of a live production bug. In tier mode each FRO was
// pushed into the pool of ONLY their highest reached tier. So a FRO who
// overshot into a tier they could not win — because a bigger collector took it —
// fell out of EVERY lower tier too and got ₹0, even though they were the top
// collector of a tier they had clearly crossed.
//
// Reported case (₹1–29,999 range, milestone 1/2/3/4 = ₹500/₹2000/₹3000/₹5000):
//   • Hema Tiwari  — ₹6000  → took the top tier
//   • Dhanshree    — ₹2400  → took tier 2
//   • Damini Thakur— ₹2000  → lost tier 2 to Dhanshree, got NOTHING
// Damini should have won tier 1 (₹500), because she crossed it and was its top
// remaining collector. The exact/threshold comparison is inclusive (`>=`), so
// ₹2000 reaching a ₹2000 tier is correct — the bug was pool eligibility.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { selectTierWinners } from './leadIncentiveTierWinners.js';

const TIERS = [
  { tier_key: 't1', target_amount: 500, prize_amount: 100 },
  { tier_key: 't2', target_amount: 2000, prize_amount: 300 },
  { tier_key: 't3', target_amount: 3000, prize_amount: 500 },
  { tier_key: 't4', target_amount: 5000, prize_amount: 1000 },
];

const member = (fro_id, total, crossTimes = {}) => ({ fro_id, total, crossTimes });

test('REGRESSION: a FRO who loses a higher tier still wins the top lower tier they crossed', () => {
  // crossTimes mirror when each FRO first crossed each tier (verified_at).
  const members = [
    member('hema', 6000, { t1: '2026-10-16T09:00:00Z', t2: '2026-10-16T09:05:00Z', t3: '2026-10-16T09:10:00Z', t4: '2026-10-16T09:15:00Z' }),
    member('dhanshree', 2400, { t1: '2026-10-16T10:00:00Z', t2: '2026-10-16T10:30:00Z' }),
    member('damini', 2000, { t1: '2026-10-16T13:42:00Z', t2: '2026-10-16T13:42:00Z' }),
  ];

  const { winnerByTier, wonTierByFro } = selectTierWinners(members, TIERS);

  assert.equal(winnerByTier.t4.member.fro_id, 'hema');       // top tier → biggest collector
  assert.equal(winnerByTier.t3, undefined);                  // nobody else crossed ₹3000
  assert.equal(winnerByTier.t2.member.fro_id, 'dhanshree');  // beat Damini at tier 2
  assert.equal(winnerByTier.t1.member.fro_id, 'damini');     // ← the fix: Damini gets tier 1

  // One prize per FRO.
  assert.equal(wonTierByFro.hema, 't4');
  assert.equal(wonTierByFro.dhanshree, 't2');
  assert.equal(wonTierByFro.damini, 't1');
});

test('each FRO takes at most one tier (highest they can win)', () => {
  // Three FROs all crossed every tier; only the top 3 tiers should be awarded,
  // each to a different FRO, top-down.
  const members = [
    member('a', 9000, { t1: 'x', t2: 'x', t3: 'x', t4: 'x' }),
    member('b', 8000, { t1: 'x', t2: 'x', t3: 'x', t4: 'x' }),
    member('c', 7000, { t1: 'x', t2: 'x', t3: 'x', t4: 'x' }),
  ];
  const { winnerByTier, wonTierByFro } = selectTierWinners(members, TIERS);

  assert.equal(winnerByTier.t4.member.fro_id, 'a');
  assert.equal(winnerByTier.t3.member.fro_id, 'b');
  assert.equal(winnerByTier.t2.member.fro_id, 'c');
  assert.equal(winnerByTier.t1, undefined); // all three already placed higher
  assert.deepEqual(
    Object.values(wonTierByFro).sort(),
    ['t2', 't3', 't4'],
  );
});

test('threshold is inclusive: exactly the tier target crosses that tier', () => {
  const members = [member('exact', 2000, { t1: 'x', t2: 'x' })];
  const { winnerByTier } = selectTierWinners(members, TIERS);
  assert.equal(winnerByTier.t2.member.fro_id, 'exact');
  assert.equal(winnerByTier.t3, undefined); // 2000 < 3000
});

test('tie on total is broken by whoever crossed that tier first', () => {
  const members = [
    member('late', 2000, { t1: '2026-10-16T15:00:00Z', t2: '2026-10-16T15:10:00Z' }),
    member('early', 2000, { t1: '2026-10-16T08:00:00Z', t2: '2026-10-16T08:10:00Z' }),
  ];
  const { winnerByTier } = selectTierWinners(members, TIERS);
  assert.equal(winnerByTier.t2.member.fro_id, 'early'); // crossed ₹2000 earlier
  assert.equal(winnerByTier.t1.member.fro_id, 'late');  // remaining FRO takes tier 1
});

test('a FRO below every tier wins nothing', () => {
  const members = [member('nobody', 400, {})];
  const { winnerByTier, wonTierByFro } = selectTierWinners(members, TIERS);
  assert.deepEqual(winnerByTier, {});
  assert.deepEqual(wonTierByFro, {});
});

test('empty inputs are safe', () => {
  assert.deepEqual(selectTierWinners([], TIERS), { winnerByTier: {}, wonTierByFro: {} });
  assert.deepEqual(selectTierWinners([member('x', 9999, { t1: 'x' })], []), { winnerByTier: {}, wonTierByFro: {} });
  assert.deepEqual(selectTierWinners(null, null), { winnerByTier: {}, wonTierByFro: {} });
});
