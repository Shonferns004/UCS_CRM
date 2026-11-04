import test from 'node:test';
import assert from 'node:assert/strict';

import { assignmentBelongsToWorker } from './stationAccess.js';

const RUCHIRA = 'ruchira-worker';
const OTHER = 'other-worker';
const RUCHIRA_AGENT = 'agent-31';

test('a row that names the worker directly belongs to that worker', () => {
  const row = { fro_worker_id: RUCHIRA, crm_agent_id: null };
  assert.equal(assignmentBelongsToWorker(row, RUCHIRA, new Set()), true);
});

test('the direct worker wins over a stale agent of record', () => {
  // BFD-7: the row is assigned to another FRO, but still carries Ruchira's old agent.
  const row = { fro_worker_id: OTHER, crm_agent_id: RUCHIRA_AGENT };
  assert.equal(assignmentBelongsToWorker(row, RUCHIRA, new Set([RUCHIRA_AGENT])), false);
});

test('a direct match is kept even when the agent belongs to someone else', () => {
  const row = { fro_worker_id: RUCHIRA, crm_agent_id: 'someone-elses-agent' };
  assert.equal(assignmentBelongsToWorker(row, RUCHIRA, new Set([RUCHIRA_AGENT])), true);
});

test('an agent-only row still grants its agent access', () => {
  const row = { fro_worker_id: null, crm_agent_id: RUCHIRA_AGENT };
  assert.equal(assignmentBelongsToWorker(row, RUCHIRA, new Set([RUCHIRA_AGENT])), true);
});

test('an agent-only row does not grant a different worker access', () => {
  const row = { fro_worker_id: null, crm_agent_id: RUCHIRA_AGENT };
  assert.equal(assignmentBelongsToWorker(row, OTHER, new Set()), false);
});

test('an unassigned row belongs to nobody', () => {
  assert.equal(assignmentBelongsToWorker({ fro_worker_id: null, crm_agent_id: null }, RUCHIRA, new Set()), false);
  assert.equal(assignmentBelongsToWorker(null, RUCHIRA, new Set()), false);
  assert.equal(assignmentBelongsToWorker({ fro_worker_id: RUCHIRA }, '', new Set()), false);
});
