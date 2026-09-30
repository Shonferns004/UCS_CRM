// The idle total the FRO sees on the performance strip, for the exact sequence
// that was reported as broken:
//
//   the 4-minute window runs out → the FRO sits idle for a couple of minutes →
//   they record a disposition → the window restarts → the strip appears not to
//   have counted those minutes.
//
// WHAT THESE TESTS ESTABLISH
//
// 1. The banking is correct. buildLiveWindow() folds the open stretch into
//    today_idle_seconds, clears idle_since and re-arms the window, so the two
//    minutes are banked rather than lost.
//
// 2. The strip is NOT expected to jump at the moment of the disposition. Its
//    read adds the running stretch to the banked total, so it already showed
//    those minutes while the FRO was sitting idle and shows the same figure
//    afterwards. The number being unchanged is correct behaviour, and mistaking
//    it for a loss is the most likely reason this was reported at all. A test
//    that asserts "the number goes up on disposition" would encode the wrong
//    expectation and fail against correct code.
//
// 3. The read must carry stats_date and frozen_at. A column missing from a
//    select does not error — it arrives as undefined and quietly changes the
//    arithmetic — which is how the strip came to disagree with the FRO's own
//    panel timer. The last test pins that list so it cannot silently regress.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildLiveWindow } from './froLiveWindow.js';
import { FRO_IDLE_LIVE_COLS } from '../utils/froIdleCols.js';
import { effectiveIdleSeconds, istDateStr } from '../utils/froIdle.js';

// Fixed clock: 2026-09-29T12:00:00Z = 17:30 IST, inside any ordinary shift.
const NOW = Date.parse('2026-09-29T12:00:00Z');
const TODAY = '2026-09-29';
const SHIFT = { startMs: NOW - 8 * 3600 * 1000, endMs: NOW + 4 * 3600 * 1000 };
const iso = (ms) => new Date(NOW - ms).toISOString();

test('reported sequence: two minutes of idle are banked by the disposition', () => {
  // The window lapsed two minutes ago and no heartbeat has stamped idle_since yet.
  const lapsed = {
    worker_id: 'f1',
    status: 'idle',
    stats_date: TODAY,
    today_idle_seconds: 0,
    idle_since: null,
    disposition_due_at: iso(2 * 60 * 1000),
  };

  // While the FRO is still sitting there, the strip already reads the two minutes.
  assert.equal(effectiveIdleSeconds(lapsed, SHIFT, NOW), 120);

  // They record the disposition.
  const { patch } = buildLiveWindow({ workerId: 'f1', liveRow: lapsed, shift: SHIFT, nowMs: NOW });

  assert.equal(patch.today_idle_seconds, 120, 'the open stretch is banked, not dropped');
  assert.equal(patch.idle_since, null, 'the running stretch is closed');
  assert.equal(patch.disposition_due_at, new Date(NOW + 240 * 1000).toISOString(), 'window re-armed to 4 minutes');

  // And the strip reads the same two minutes afterwards, now from the banked total.
  assert.equal(effectiveIdleSeconds({ ...patch, stats_date: TODAY }, SHIFT, NOW), 120);
});

test('the strip figure does not change across the disposition, by design', () => {
  // Guards the expectation in the header. If someone "fixes" this by making the
  // strip jump on disposition they will double-count, because the running stretch
  // is already included while the period is open.
  const lapsed = {
    worker_id: 'f1', status: 'idle', stats_date: TODAY, today_idle_seconds: 0,
    idle_since: null, disposition_due_at: iso(2 * 60 * 1000),
  };
  const before = effectiveIdleSeconds(lapsed, SHIFT, NOW);
  const after = effectiveIdleSeconds(
    { ...buildLiveWindow({ workerId: 'f1', liveRow: lapsed, shift: SHIFT, nowMs: NOW }).patch, stats_date: TODAY },
    SHIFT, NOW,
  );
  assert.equal(before, after);
});

test('a banked total survives when stats_date is read, and is lost when it is not', () => {
  // A row last written yesterday: the banked total is yesterday's unless the day
  // is read from stats_date rather than inferred from updated_at.
  const row = {
    worker_id: 'f1', status: 'online', stats_date: TODAY,
    today_idle_seconds: 600, idle_since: null,
    disposition_due_at: null,
    updated_at: iso(24 * 3600 * 1000),
  };

  assert.equal(effectiveIdleSeconds(row, SHIFT, NOW), 600, 'stats_date carries the day');

  // The same row with the column omitted — what the strip used to query. A
  // missing column does not raise, it silently collapses the figure to zero.
  const { stats_date, ...withoutStatsDate } = row;
  assert.equal(istDateStr(new Date(withoutStatsDate.updated_at)), '2026-09-28');
  assert.equal(effectiveIdleSeconds(withoutStatsDate, SHIFT, NOW), 0, 'the omission is what zeroes the strip');
});

test('a freeze caps a period that had already begun, and only that period', () => {
  const base = {
    worker_id: 'f1', status: 'meeting', stats_date: TODAY,
    today_idle_seconds: 0, disposition_due_at: null,
    frozen_at: iso(5 * 60 * 1000),
  };

  // Began ten minutes ago, freeze began five minutes ago: only the first five
  // minutes are the officer's own idle.
  assert.equal(effectiveIdleSeconds({ ...base, idle_since: iso(10 * 60 * 1000) }, SHIFT, NOW), 5 * 60);

  // Began after the freeze: the cap is inert.
  assert.equal(effectiveIdleSeconds({ ...base, status: 'idle', idle_since: iso(2 * 60 * 1000) }, SHIFT, NOW), 2 * 60);
});

test('every idle read must include the columns that change the answer', () => {
  // The regression guard for the actual defect: each idle surface used to
  // hand-write its own column list, and the omissions were silent.
  const cols = FRO_IDLE_LIVE_COLS.split(',').map(c => c.trim());
  for (const required of ['stats_date', 'frozen_at', 'today_idle_seconds', 'idle_since', 'disposition_due_at', 'updated_at']) {
    assert.ok(cols.includes(required), `FRO_IDLE_LIVE_COLS must include ${required}`);
  }
  assert.equal(new Set(cols).size, cols.length, 'no duplicated columns');
});
