// Read-side freezing of a covered-away FRO's idle.
//
// The commit guards in froIdleCommit stop the total being WRITTEN, but that alone
// is not enough: every read path adds the still-open period on top of the
// committed total, so without a read-side freeze the number keeps climbing for
// somebody who has already gone home, and the board, the status list and the
// FRO's own strip each disagree with the ledger.
//
// These tests pin the arithmetic. They are the reason "frozen" means frozen
// everywhere rather than only in storage.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  effectiveIdleSeconds,
  frozenIdleSeconds,
  idleFreezeCutoffMs,
  isIdleNow,
  liveIdleSeconds,
  openIdleSeconds,
} from './froIdle.js';

// Fixed clock so nothing here depends on the wall clock. 2026-09-29T12:00:00Z
// is 17:30 IST — mid-afternoon on the working day, inside any plausible shift.
const NOW = Date.parse('2026-09-29T12:00:00Z');
const SHIFT = { startMs: NOW - 8 * 3600 * 1000, endMs: NOW + 4 * 3600 * 1000 };
const ago = (ms) => new Date(NOW - ms).toISOString();

test('the freeze cutoff is the last write to the person\'s own row', () => {
  assert.equal(idleFreezeCutoffMs({ updated_at: ago(60_000) }), NOW - 60_000);
});

test('a row that does not exist has no evidence of presence, so nothing accrues', () => {
  // No updated_at at all: the cutoff is 0, which drops an open period that began
  // at any real time. Only already-committed idle survives.
  assert.equal(idleFreezeCutoffMs({}), 0);
  assert.equal(idleFreezeCutoffMs(null), 0);
  assert.equal(idleFreezeCutoffMs({ updated_at: 'not-a-date' }), 0);
});

test('a covered-away worker keeps the idle they banked before they left', () => {
  const row = {
    idle_since: ago(30 * 60 * 1000),   // open for 30 min
    today_idle_seconds: 600,          // 10 min already committed
    updated_at: ago(20 * 60 * 1000),   // then their row went quiet 20 min ago
  };
  // 10 min committed + the 10 minutes of open period that elapsed before they
  // walked away. The 10 minutes after the cutoff are not added.
  assert.equal(frozenIdleSeconds(row, SHIFT, NOW), 600 + 10 * 60);
  assert.equal(openIdleSeconds(row, SHIFT, NOW, idleFreezeCutoffMs(row)), 10 * 60);
});

test('the same row, unfrozen, keeps counting to now', () => {
  // The contrast that matters: without the cutoff the number is 30 minutes, not
  // 20. That drift is the bug this file exists to prevent.
  const row = {
    idle_since: ago(30 * 60 * 1000),
    today_idle_seconds: 600,
    updated_at: ago(20 * 60 * 1000),
  };
  assert.equal(liveIdleSeconds(row, SHIFT, NOW), 600 + 30 * 60);
  assert.equal(openIdleSeconds(row, SHIFT, NOW), 30 * 60);
});

test('a deadline that lapsed after they left is not idle at all', () => {
  // No stamp: the period is derived from the disposition deadline, which lapsed
  // 10 minutes AFTER the row went quiet. The covered worker was already gone, so
  // there is no idle here and no badge to show.
  const row = {
    idle_since: null,
    disposition_due_at: ago(-10 * 60 * 1000),   // lapsed 10 min in the future
    updated_at: ago(40 * 60 * 1000),
  };
  const frozen = idleFreezeCutoffMs(row);
  assert.equal(liveIdleSeconds(row, SHIFT, NOW, frozen), 0);
  assert.equal(openIdleSeconds(row, SHIFT, NOW, frozen), 0);
  assert.equal(isIdleNow(row, SHIFT, NOW, frozen), false);
});

test('a deadline that lapsed while they were still there IS real idle', () => {
  // Same shape, opposite ordering: the deadline lapsed 5 minutes before the row
  // went quiet, so those 5 minutes happened while they were present and are
  // billed. Freezing must not swallow genuine idle.
  const row = {
    idle_since: null,
    disposition_due_at: ago(35 * 60 * 1000),   // lapsed 35 min ago
    updated_at: ago(30 * 60 * 1000),          // row went quiet 30 min ago
  };
  const frozen = idleFreezeCutoffMs(row);
  assert.equal(liveIdleSeconds(row, SHIFT, NOW, frozen), 5 * 60);
  assert.equal(isIdleNow(row, SHIFT, NOW, frozen), true);
});

test('effectiveIdleSeconds takes the same cutoff, so the board cannot drift', () => {
  // Both helpers are the single definition every reader shares. If they ever
  // disagree the super-admin list, the NGO board and the FRO's own strip show
  // three different numbers for the same person at the same moment.
  const row = { idle_since: ago(45 * 60 * 1000), today_idle_seconds: 120, updated_at: ago(15 * 60 * 1000) };
  const cutoff = idleFreezeCutoffMs(row);
  assert.equal(effectiveIdleSeconds(row, SHIFT, NOW, cutoff), frozenIdleSeconds(row, SHIFT, NOW));
  // 2 min committed + the 30 minutes between the stamp and the cutoff.
  assert.equal(effectiveIdleSeconds(row, SHIFT, NOW, cutoff), 120 + 30 * 60);
});

test('with no cutoff the readers behave exactly as before', () => {
  // Default callers pass nothing, so an ordinary FRO who is not covered is
  // completely unaffected by any of this.
  const row = { idle_since: ago(5 * 60 * 1000), today_idle_seconds: 0, updated_at: ago(5 * 60 * 1000) };
  assert.equal(effectiveIdleSeconds(row, SHIFT, NOW), 300);
  assert.equal(openIdleSeconds(row, SHIFT, NOW), 300);
  assert.equal(isIdleNow(row, SHIFT, NOW), true);
});

test('the shift clamp still wins over the freeze cutoff', () => {
  // Someone idled from before the shift opened and is covered away now. The freeze
  // must not extend idle past the end of the working day — here the cutoff is the
  // LATER of the two bounds, so the shift end has to be the one that applies.
  const row = {
    idle_since: ago(6 * 3600 * 1000),
    today_idle_seconds: 0,
    updated_at: ago(1 * 3600 * 1000),
  };
  const clamp = { startMs: NOW - 8 * 3600 * 1000, endMs: NOW - 2 * 3600 * 1000 };
  assert.equal(liveIdleSeconds(row, clamp, NOW, idleFreezeCutoffMs(row)), 4 * 3600);
});

test('frozen reads are null-safe', () => {
  assert.equal(frozenIdleSeconds(null, SHIFT, NOW), 0);
  assert.equal(frozenIdleSeconds({}, SHIFT, NOW), 0);
  assert.equal(openIdleSeconds(null, SHIFT, NOW, 0), 0);
  assert.equal(isIdleNow(null, SHIFT, NOW, 0), false);
});
