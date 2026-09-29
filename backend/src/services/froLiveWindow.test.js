// Re-arm rule for the FRO's 4-minute live window.
//
// The window used to be reset only by a disposition, keyed on the painted FRO
// id, and gated behind "unarmed and nothing recorded today". That is the source
// of the reported false-idle: a donation/call/note reset the client's clock but
// never the server deadline, and under work-as the disposition wrote the covered
// FRO's row while every status read used the operator's. buildLiveWindow() is
// the single pure rule — any saved activity buys a fresh window, on whatever
// worker id the caller resolves to the human at the keyboard — and
// resetLiveWindow() is the thin write path around it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildLiveWindow, resetLiveWindow } from './froLiveWindow.js';

// Fixed clock: 2026-09-29T12:00:00Z = 17:30 IST, mid-afternoon inside any shift.
const NOW = Date.parse('2026-09-29T12:00:00Z');
const SHIFT = { startMs: NOW - 8 * 3600 * 1000, endMs: NOW + 4 * 3600 * 1000 };
const ago = (ms) => new Date(NOW - ms).toISOString();
const DUE = new Date(NOW + 240 * 1000).toISOString();

test('any activity re-arms an idle row to now + 4 minutes and clears idle_since', () => {
  const liveRow = {
    worker_id: 'f1',
    status: 'idle',
    today_idle_seconds: 0,
    idle_since: ago(5 * 60 * 1000),
    disposition_due_at: null,
  };
  const { patch, timer } = buildLiveWindow({ workerId: 'f1', liveRow, shift: SHIFT, nowMs: NOW });

  assert.equal(patch.disposition_due_at, DUE);
  assert.equal(patch.idle_since, null);
  assert.equal(patch.status, 'online');
  assert.equal(patch.current_donor_id, null);
  assert.equal(patch.call_started_at, null);
  // The 5 minutes already open were folded into the day before clearing.
  assert.equal(patch.today_idle_seconds, 5 * 60);
  assert.equal(timer.seconds_left, 240);
  assert.equal(timer.is_idle, false);
  assert.equal(timer.today_idle_seconds, 5 * 60);
});

test('an overdue save still banks the minutes between deadline and now', () => {
  const liveRow = {
    worker_id: 'f1',
    status: 'idle',
    today_idle_seconds: 600,          // 10 min already committed today
    idle_since: null,
    disposition_due_at: ago(60 * 1000), // lapsed 60s ago
  };
  const { patch, timer } = buildLiveWindow({ workerId: 'f1', liveRow, shift: SHIFT, nowMs: NOW });

  // 10 committed + the 60s of open period before the save landed.
  assert.equal(patch.today_idle_seconds, 600 + 60);
  assert.equal(patch.idle_since, null);
  assert.equal(patch.status, 'online');
  assert.equal(timer.today_idle_seconds, 660);
});

test('with a future deadline, only the idle_since period is folded', () => {
  const liveRow = {
    worker_id: 'f1',
    status: 'online',
    today_idle_seconds: 120,          // 2 min committed
    idle_since: ago(3 * 60 * 1000),   // 3 min open, not yet overdue
    disposition_due_at: new Date(NOW + 600 * 1000).toISOString(),
  };
  const { patch } = buildLiveWindow({ workerId: 'f1', liveRow, shift: SHIFT, nowMs: NOW });

  assert.equal(patch.today_idle_seconds, 120 + 3 * 60);
  assert.equal(patch.idle_since, null);
  assert.equal('status' in patch, false); // was already online
});

test('a frozen row re-arms but never punches back to online', () => {
  for (const frozen of [
    { status: 'idle', is_paused: true },
    { status: 'meeting', is_paused: false },
  ]) {
    const liveRow = {
      worker_id: 'f1',
      ...frozen,
      today_idle_seconds: 0,
      idle_since: ago(5 * 60 * 1000),
      disposition_due_at: null,
    };
    const { patch } = buildLiveWindow({ workerId: 'f1', liveRow, shift: SHIFT, nowMs: NOW });

    assert.equal(patch.disposition_due_at, DUE);
    assert.equal(patch.idle_since, null);
    assert.equal('status' in patch, false, `frozen row must not flip status (${frozen.status})`);
  }
});

test('a missing live row still builds the patch and timer without a status flip', () => {
  const { patch, timer } = buildLiveWindow({ workerId: 'f1', liveRow: null, shift: SHIFT, nowMs: NOW });

  assert.equal(patch.worker_id, 'f1');
  assert.equal(patch.disposition_due_at, DUE);
  assert.equal('status' in patch, false);
  assert.equal('today_idle_seconds' in patch, false);
  assert.equal(timer.seconds_left, 240);
  assert.equal(timer.is_idle, false);
  assert.equal(timer.today_idle_seconds, 0);
});

test('outside the shift the window is not re-armed', () => {
  const liveRow = { worker_id: 'f1', status: 'idle', today_idle_seconds: 0 };
  const offShift = { startMs: NOW - 2 * 3600 * 1000, endMs: NOW - 3600 * 1000 };
  const { patch, timer } = buildLiveWindow({ workerId: 'f1', liveRow, shift: offShift, nowMs: NOW });

  assert.equal(patch.disposition_due_at, null);
  assert.equal(timer.seconds_left, null);
  assert.equal(timer.is_idle, false);
});

test('resetLiveWindow reads and upserts the given worker row and returns the timer', async () => {
  const seen = { upserts: [] };
  const liveRow = { worker_id: 'f1', status: 'idle', today_idle_seconds: 0 };
  const fakeDb = {
    seen,
    from(table) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: table === 'fro_live_status' ? liveRow : null }),
          }),
        }),
        upsert: async (patch, opts) => {
          seen.upserts.push({ table, patch, opts });
          return { error: null };
        },
      };
    },
  };

  const timer = await resetLiveWindow('f1', {
    nowMs: NOW,
    dbClient: fakeDb,
    getShift: async () => SHIFT,
  });

  assert.equal(seen.upserts.length, 1);
  assert.equal(seen.upserts[0].table, 'fro_live_status');
  assert.equal(seen.upserts[0].opts.onConflict, 'worker_id');
  assert.equal(seen.upserts[0].patch.worker_id, 'f1');
  assert.equal(seen.upserts[0].patch.status, 'online');
  assert.equal(timer.seconds_left, 240);
  assert.equal(timer.is_idle, false);
});