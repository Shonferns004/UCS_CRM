// Pure-logic tests for the controlled work queue (no live DB needed).
// Run: node backend/scripts/test-work-queue.mjs
//
// These cover the queue's business rules that don't require a database:
//   - month / cycle-key derivation
//   - retryable-vs-terminal disposition classification (a donor must NOT reappear
//     after a terminal disposition, but MAY return after a retryable one)
//   - reconcile SQL shape (one row + position per donor; correct placeholders)
//
// The DB-backed guarantees (unique constraint prevents any donor being enqueued
// twice per worker+scope; advisory lock + transaction serialize double-tab /
// double-click; same-day unique index blocks duplicate disposition rows) are
// enforced by migration 087 and are exercised against the live DB, which is not
// reachable from a dev machine.

import assert from 'node:assert/strict';
import {
  monthKey,
  cycleKey,
  classifyDisposition,
  RETRYABLE_NOT_CONNECTED_DETAILS,
  buildReconcileSql,
} from '../src/models/workQueueModel.js';

let passed = 0;
const ok = (name) => { passed++; console.log(`  ✓ ${name}`); };

console.log('\nmonthKey / cycleKey');
{
  const mk = monthKey(new Date('2026-08-15T12:00:00Z')); // IST = 17:30 Aug 15
  assert.equal(typeof mk, 'string');
  assert.match(mk, /^\d{4}-\d{2}$/);
  ok(`monthKey returns a YYYY-MM key (${mk})`);

  const ck = cycleKey({ ngoId: 'ngo-1', station: 'DH-1', tab: 'new', date: new Date('2026-08-15T12:00:00Z') });
  assert.equal(ck, `ngo-1:DH-1:new:${mk}`);
  ok(`cycleKey composes ngo:station:tab:month (${ck})`);

  // 'all'/null normalized identically per plan (station/ngo agnostic when absent)
  const ckAll = cycleKey({ ngoId: null, station: 'all', tab: 'old', date: new Date('2026-08-15T12:00:00Z') });
  assert.equal(ckAll, `all:all:old:${mk}`);
  ok(`cycleKey normalizes null/all scope (${ckAll})`);
}

console.log('\ndisposition classification (who reappears vs who is removed)');
{
  // Retryable not-connected -> stays active so it can be reworked.
  for (const d of ['ringing', 'busy', 'unreachable', 'out_of_coverage', 'voicemail', 'call_waiting', 'switched_off']) {
    const c = classifyDisposition(d);
    assert.equal(c.retryable, true, `${d} should be retryable`);
    assert.equal(c.terminal, false, `${d} should NOT be terminal`);
  }
  ok('retryable not-connected dispositions keep the donor active');

  // Everything else is terminal for the queue -> removed so it never reappears.
  for (const d of ['done', 'lead_done', 'not_interested', 'dnd', 'wrong_number', 'scheduled', 'callback', 'not_possible', 'call_disconnected']) {
    const c = classifyDisposition(d);
    assert.equal(c.terminal, true, `${d} should be terminal`);
    assert.equal(c.retryable, false, `${d} should not be retryable`);
  }
  ok('terminal dispositions remove the donor from the active queue (no reappear)');

  assert.equal(RETRYABLE_NOT_CONNECTED_DETAILS.has('ringing'), true);
  assert.equal(RETRYABLE_NOT_CONNECTED_DETAILS.has('done'), false);
  ok('RETRYABLE_NOT_CONNECTED_DETAILS exported set is consistent');
}

console.log('\nreconcile SQL shape (ordering / duplicate-positioning)');
{
  const { sql, params, cycleKey } = buildReconcileSql({
    workerId: 'w1',
    donors: [
      { donor_id: 10, ngo_id: 'n1' },
      { donor_id: 11, ngo_id: 'n1' },
      { donor_id: 12, ngo_id: 'n2' },
    ],
    ngoId: null, station: 'DH-1', tab: 'new',
  });
  assert.match(sql, /INSERT INTO work_queue/);
  assert.match(sql, /ON CONFLICT \(worker_id, donor_id, ngo_id, cycle_key\)/);
  // 3 donors -> 3 value tuples in INSERT
  const valueTuples = sql.match(/\(\$1, \$2, \$3, \$4/g) || [];
  assert.equal(valueTuples.length, 3, 'one value tuple per donor');
  // positions are the 3rd param of each donor tuple: indices 7, 10, 13
  assert.deepEqual([params[7], params[10], params[13]], [0, 1, 2], 'positions ascend in FIFO order');
  assert.match(cycleKey, /DH-1:new/);
  ok('reconcile emits one row per donor, FIFO positions 0..n, and the unique scope constraint');
}

console.log(`\n${passed} assertions passed`);
