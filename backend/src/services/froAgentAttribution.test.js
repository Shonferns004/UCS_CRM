// An agent working a FRO's queue used to land on the FRO's own books entirely:
// the working, the idle, and the daily total. The interval still keys on the
// covered FRO — it has a foreign key to workers(id) and an agent has no workers
// row — so the split is done by STAMP, not by re-keying.
//
// These tests pin the split itself, because a reader that forgets it either bills
// the FRO for the agent's time or hides the agent's own work entirely.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sessionsForActor } from './froTimeSessions.js';

const AGENT = 'agent-uuid-1';
const at = (t) => new Date(`2026-10-09T${t}:00.000+05:30`).toISOString();

const day = [
  { state: 'WORKING', started_at: at('09:30'), ended_at: at('10:00'), agent_id: null },
  { state: 'IDLE', started_at: at('10:00'), ended_at: at('10:10'), agent_id: null },
  { state: 'WORKING', started_at: at('10:10'), ended_at: at('13:00'), agent_id: AGENT },
  { state: 'IDLE', started_at: at('13:00'), ended_at: at('13:40'), agent_id: AGENT },
  { state: 'WORKING', started_at: at('13:40'), ended_at: at('18:00'), agent_id: null },
];

test("the FRO's own day excludes every interval an agent was stamped on", () => {
  const own = sessionsForActor(day);
  assert.equal(own.length, 3);
  assert.ok(own.every((s) => s.agent_id == null), 'no agent-stamped interval may leak to the FRO');
});

test("the agent's day is exactly their own intervals", () => {
  const mine = sessionsForActor(day, AGENT);
  assert.equal(mine.length, 2);
  assert.ok(mine.every((s) => s.agent_id === AGENT));
});

test('the two halves partition the day with nothing lost or double counted', () => {
  assert.equal(sessionsForActor(day).length + sessionsForActor(day, AGENT).length, day.length);
});

test('an unstamped ledger keeps working exactly as before', () => {
  // Pre-migration rows have no agent column at all; the FRO must still see them all.
  const legacy = [
    { state: 'WORKING', started_at: at('09:30'), ended_at: at('12:00') },
    { state: 'IDLE', started_at: at('12:00'), ended_at: at('12:30') },
  ];
  assert.equal(sessionsForActor(legacy).length, 2);
});

test('an empty-string stamp counts as unstamped, not as an agent', () => {
  const rows = [
    { state: 'WORKING', started_at: at('09:00'), ended_at: at('10:00'), agent_id: '' },
    { state: 'WORKING', started_at: at('10:00'), ended_at: at('11:00'), agent_id: AGENT },
  ];
  const own = sessionsForActor(rows);
  assert.equal(own.length, 1);
  assert.equal(own[0].agent_id, '');
});

test('an agent who has not worked today gets an empty day, not the FRO\'s', () => {
  // The whole point: no agent rows must never resolve to "show the FRO's figures".
  assert.deepEqual(sessionsForActor(day, 'some-other-agent'), []);
});

test('an empty ledger yields an empty day for both actors', () => {
  assert.deepEqual(sessionsForActor([], AGENT), []);
  assert.deepEqual(sessionsForActor(null), []);
});