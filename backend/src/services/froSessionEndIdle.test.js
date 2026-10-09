// Three bugs, one rule each. All three come from the same shape: an interval or a
// deadline outliving the session that created it, and a later reader treating the
// leftover as a live claim on somebody's time.
//
//   1. sessionHandoverPlan  — a FRO who moves machines must not be billed for the
//      gap between closing one panel and opening the other.
//   2. idleIdentitiesToClose — signing out of a work-as session must close the
//      OPERATOR's clocks as well as the painted FRO's.
//   3. the cover-end park    — a covered FRO's row must stop accruing when the
//      cover ends, which is the moment the covered-away freeze stops applying.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sessionHandoverPlan } from '../utils/froIdle.js';
import { idleIdentitiesToClose } from '../utils/workAs.js';

const NOW = Date.parse('2026-10-09T10:00:00Z');
const mins = (n) => NOW - n * 60 * 1000;

// ── 1. session handover ──────────────────────────────────────────────────────

test('a device change closes the gap at the last heartbeat, not at login', () => {
  const plan = sessionHandoverPlan({ lastSeenAtMs: mins(45), nowMs: NOW, sameIstDay: true });
  assert.equal(plan.skip, undefined);
  assert.equal(plan.closeAtMs, mins(45), 'the 45-minute gap must not be billed');
  assert.ok(plan.closeAtMs < NOW);
});

test('a second tab is not a handover', () => {
  const plan = sessionHandoverPlan({ panelStillLive: true, lastSeenAtMs: mins(2), nowMs: NOW, sameIstDay: true });
  assert.equal(plan.skip, 'panel_still_live');
});

test('a stale session from another day is left to the day-boundary cleanup', () => {
  const plan = sessionHandoverPlan({ lastSeenAtMs: mins(60 * 20), nowMs: NOW, sameIstDay: false });
  assert.equal(plan.skip, 'other_day');
});

test('no last-seen evidence means no handover', () => {
  assert.equal(sessionHandoverPlan({ lastSeenAtMs: NaN, nowMs: NOW }).skip, 'no_last_seen');
});

test('a last-seen in the future is refused rather than closed at a moment that has not happened', () => {
  const plan = sessionHandoverPlan({ lastSeenAtMs: NOW + 60_000, nowMs: NOW, sameIstDay: true });
  assert.equal(plan.skip, 'last_seen_in_future');
});

test('logging straight back in still hands over, and bills only up to the last heartbeat', () => {
  // 10 seconds of real presence before the panel went away.
  const plan = sessionHandoverPlan({ lastSeenAtMs: NOW - 10_000, nowMs: NOW, sameIstDay: true });
  assert.equal(plan.closeAtMs, NOW - 10_000);
});

// ── 2. which identities a logout must close ──────────────────────────────────

test('a work-as logout closes both the operator and the painted FRO', () => {
  const ids = idleIdentitiesToClose({ humanId: 'operator-1', paintedId: 'fro-9' });
  assert.deepEqual(ids.sort(), ['fro-9', 'operator-1']);
});

test('an ordinary login closes only that one row', () => {
  assert.deepEqual(idleIdentitiesToClose({ humanId: 'fro-9', paintedId: 'fro-9' }), ['fro-9']);
});

test('a missing identity is skipped rather than closing nobody', () => {
  assert.deepEqual(idleIdentitiesToClose({ humanId: null, paintedId: 'fro-9' }), ['fro-9']);
  assert.deepEqual(idleIdentitiesToClose({ humanId: undefined, paintedId: undefined }), []);
});

test('an agent session does not duplicate one id into two', () => {
  // An agent's human id IS the painted FRO until Fix D moves it; the de-dup keeps
  // that from committing the same row twice.
  assert.deepEqual(idleIdentitiesToClose({ humanId: 'fro-9', paintedId: 'fro-9' }), ['fro-9']);
});