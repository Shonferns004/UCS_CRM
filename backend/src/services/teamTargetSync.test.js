import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  mergeTeamTargetPlan,
  teamKeyOf,
  isMonthKey,
  resolveMonthKey,
  TEAM_TARGET_MODE,
} from './teamTargetSyncService.js';
import { NO_TEAM_KEY } from '../utils/teamCollection.js';

// The team target is the sum of its members' individual targets. These cover the
// decision this feature must never get wrong: a number somebody typed by hand is
// not silently replaced, while a team nobody ever set starts syncing.

const base = {
  roster: ['UFS1', 'UFS2'],
  syncedByTeam: { UFS1: 450000, UFS2: 310000 },
  memberCountByTeam: { UFS1: 6, UFS2: 5 },
  membersByTeam: { UFS1: [{ id: 'a', target: 450000 }], UFS2: [] },
};

test('a team with no saved plan starts in AUTO and takes the members sum', () => {
  const out = mergeTeamTargetPlan(base);
  assert.equal(out.byTeam.UFS1, 450000);
  assert.equal(out.modes.UFS1, TEAM_TARGET_MODE.AUTO);
  assert.equal(out.byTeam.UFS2, 310000);
  assert.deepEqual(out.totals, { target: 760000, synced: 760000 });
});

test('a legacy saved amount with no mode is treated as MANUAL and is not overwritten', () => {
  const out = mergeTeamTargetPlan({
    ...base,
    storedByTeam: { UFS1: 500000 },
  });
  assert.equal(out.byTeam.UFS1, 500000, 'the typed number must survive');
  assert.equal(out.modes.UFS1, TEAM_TARGET_MODE.MANUAL);
  const ufs1 = out.teams.find((t) => t.team === 'UFS1');
  assert.equal(ufs1.drift, 50000, 'drift vs the members sum is surfaced, not applied');
  assert.equal(ufs1.synced, 450000);
});

test('an explicit AUTO wins over a saved amount', () => {
  const out = mergeTeamTargetPlan({
    ...base,
    storedByTeam: { UFS1: 500000 },
    modesByTeam: { UFS1: TEAM_TARGET_MODE.AUTO },
  });
  assert.equal(out.byTeam.UFS1, 450000);
  assert.equal(out.teams.find((t) => t.team === 'UFS1').drift, 0);
});

test('a zero saved amount with no mode is AUTO, not a manual zero', () => {
  const out = mergeTeamTargetPlan({
    ...base,
    storedByTeam: { UFS1: 0 },
  });
  assert.equal(out.modes.UFS1, TEAM_TARGET_MODE.AUTO);
  assert.equal(out.byTeam.UFS1, 450000);
});

test('a roster team with no members sits at zero instead of vanishing', () => {
  const out = mergeTeamTargetPlan({
    roster: ['UFS1', 'UFS3'],
    syncedByTeam: { UFS1: 100 },
    memberCountByTeam: { UFS1: 1 },
  });
  assert.ok(out.teams.some((t) => t.team === 'UFS3'), 'the editor must still show the lane');
  assert.equal(out.byTeam.UFS3, 0);
});

test('a team value outside the roster is kept, flagged, and counted in the total', () => {
  const out = mergeTeamTargetPlan({
    ...base,
    syncedByTeam: { UFS1: 450000, UFS2: 310000, GHOST: 1000 },
    memberCountByTeam: { UFS1: 6, UFS2: 5, GHOST: 1 },
  });
  const ghost = out.teams.find((t) => t.team === 'GHOST');
  assert.ok(ghost, 'dropping it would make the total disagree with the members sum');
  assert.equal(ghost.unrostered, true);
  assert.equal(out.totals.synced, 761000);
});

test('legacy mixed-case stored keys fold into one lane instead of double counting', () => {
  const out = mergeTeamTargetPlan({
    ...base,
    storedByTeam: { ' ufs1 ': 500000 },
    modesByTeam: { 'ufs1': TEAM_TARGET_MODE.MANUAL },
  });
  assert.equal(out.teams.filter((t) => t.team === 'UFS1').length, 1);
  assert.equal(out.byTeam.UFS1, 500000);
  assert.equal(out.teams.find((t) => t.team === 'UFS1').stored, 500000);
});

test('the No Team bucket never becomes a lane', () => {
  const out = mergeTeamTargetPlan({
    ...base,
    syncedByTeam: { UFS1: 100, [NO_TEAM_KEY]: 999 },
    memberCountByTeam: { UFS1: 1, [NO_TEAM_KEY]: 2 },
  });
  assert.equal(out.teams.some((t) => t.team === NO_TEAM_KEY), false);
  assert.equal(out.totals.synced, 100);
});

test('team keys normalise the same way the board normalises workers.team', () => {
  assert.equal(teamKeyOf(' ufs1 '), 'UFS1');
  assert.equal(teamKeyOf(''), NO_TEAM_KEY);
  assert.equal(teamKeyOf(null), NO_TEAM_KEY);
});

test('month keys fall back to the current month rather than inventing one', () => {
  assert.equal(isMonthKey('2026-11'), true);
  assert.equal(isMonthKey('2026-13'), true, 'shape check only; the writer clamps the rest');
  assert.equal(isMonthKey('nope'), false);
  assert.match(resolveMonthKey('nope'), /^\d{4}-\d{2}$/);
});
