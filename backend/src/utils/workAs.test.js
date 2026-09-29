// Cover-relationship helpers. These decide which person a live row belongs to
// and who is covering whom, so a regression here silently mis-bills idle or
// blanks a real FRO off the board.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveOperatorIdentity,
  liveRowWorkerId,
  splitWorkerContext,
  indexCovers,
  groupCoversByOperator,
  isCovered,
} from './workAs.js';

test('a plain login resolves to itself as operator', () => {
  const r = resolveOperatorIdentity({ id: 'f1', name: 'Riya' });
  assert.equal(r.chained, false);
  assert.equal(r.imposterId, 'f1');
  assert.equal(r.imposterName, 'Riya');
});

test('a work-as switch resolves the human, not the painted FRO', () => {
  const r = resolveOperatorIdentity({
    id: 'f2', name: 'Riya', impersonation: true,
    imposter_id: 'f1', imposter_name: 'Priya',
  });
  assert.equal(r.chained, true);
  assert.equal(r.imposterId, 'f1');
  assert.equal(r.imposterName, 'Priya');
});

test('liveRowWorkerId files under the human during a cover', () => {
  assert.equal(liveRowWorkerId({ paintedId: 'f2', operatorId: 'f1' }), 'f1');
});

test('liveRowWorkerId is a no-op for an ordinary login', () => {
  assert.equal(liveRowWorkerId({ paintedId: 'f1', operatorId: 'f1' }), 'f1');
  assert.equal(liveRowWorkerId({ paintedId: 'f1', operatorId: null }), 'f1');
  assert.equal(liveRowWorkerId({ paintedId: 'f1', operatorId: '' }), 'f1');
  assert.equal(liveRowWorkerId({ paintedId: 'f1' }), 'f1');
});

test('two people active at once get two different rows', () => {
  // Priya covers Riya; the real Riya works her own account. Keying on the
  // painted id collapsed both onto 'f2' and one overwrote the other.
  const priya = liveRowWorkerId({ paintedId: 'f2', operatorId: 'f1' });
  const riya = liveRowWorkerId({ paintedId: 'f2' });
  assert.notEqual(priya, riya);
  assert.equal(priya, 'f1');
  assert.equal(riya, 'f2');
});

test('splitWorkerContext keeps data with the account and metrics with the human', () => {
  const ctx = splitWorkerContext({
    id: 'f2', name: 'Riya', impersonation: true,
    imposter_id: 'f1', imposter_name: 'Priya',
  });
  assert.equal(ctx.isWorkAs, true);
  assert.equal(ctx.data.id, 'f2', 'queue and donors stay with the covered account');
  assert.equal(ctx.data.name, 'Riya');
  assert.equal(ctx.human.id, 'f1', 'card and live counters follow the person at the keyboard');
  assert.equal(ctx.human.name, 'Priya');
});

test('splitWorkerContext is identical for a normal login', () => {
  const ctx = splitWorkerContext({ id: 'f1', name: 'Priya' });
  assert.equal(ctx.isWorkAs, false);
  assert.equal(ctx.data.id, 'f1');
  assert.equal(ctx.human.id, 'f1');
  assert.equal(ctx.human.name, 'Priya');
});

test('indexCovers maps a covered person to every operator covering them', () => {
  const m = indexCovers([
    { target_fro_worker_id: 'f2', operator_user_id: 'f1', operator_name: 'Priya' },
    { target_fro_worker_id: 'f2', operator_user_id: 'f3', operator_name: 'Anjana' },
  ]);
  assert.equal(m.get('f2').length, 2);
  assert.deepEqual(m.get('f2').map((x) => x.operatorUserId).sort(), ['f1', 'f3']);
});

test('indexCovers holds a chain, which a single slot on the live row cannot', () => {
  // Priya covers Riya; the real Riya covers Meera. Riya is covered AND covering.
  const m = indexCovers([
    { target_fro_worker_id: 'f2', operator_user_id: 'f1', operator_name: 'Priya' },
    { target_fro_worker_id: 'f3', operator_user_id: 'f2', operator_name: 'Riya' },
  ]);
  assert.equal(isCovered(m, 'f2'), true);
  assert.equal(isCovered(m, 'f3'), true);
  assert.deepEqual(groupCoversByOperator([
    { target_fro_worker_id: 'f2', operator_user_id: 'f1' },
    { target_fro_worker_id: 'f3', operator_user_id: 'f2' },
  ]).get('f2'), ['f3']);
});

test('indexCovers groups by operator in the other direction', () => {
  const m = groupCoversByOperator([
    { target_fro_worker_id: 'f2', operator_user_id: 'f1' },
    { target_fro_worker_id: 'f3', operator_user_id: 'f1' },
  ]);
  assert.deepEqual(m.get('f1').sort(), ['f2', 'f3']);
});

test('isCovered is false for an uncovered person and for junk input', () => {
  const m = indexCovers([{ target_fro_worker_id: 'f2', operator_user_id: 'f1' }]);
  assert.equal(isCovered(m, 'f9'), false);
  assert.equal(isCovered(m, null), false);
  assert.equal(isCovered(m, undefined), false);
  assert.equal(isCovered(null, 'f2'), false);
  assert.equal(isCovered(undefined, 'f2'), false);
  assert.equal(isCovered(new Map(), 'f2'), false);
});

test('cover helpers survive malformed rows without throwing', () => {
  assert.equal(indexCovers(null).size, 0);
  assert.equal(indexCovers(undefined).size, 0);
  assert.equal(indexCovers([]).size, 0);
  assert.equal(groupCoversByOperator(null).size, 0);
  // A row missing either side is unusable and must not create a bogus entry.
  assert.equal(indexCovers([{ target_fro_worker_id: 'f2' }]).size, 0);
  assert.equal(indexCovers([{ operator_user_id: 'f1' }]).size, 0);
  assert.equal(indexCovers([null, undefined, {}]).size, 0);
  assert.equal(indexCovers([{ target_fro_worker_id: '', operator_user_id: 'f1' }]).size, 0);
});

test('ids are compared as strings so a numeric operator id still matches', () => {
  // Postgres returns uuid columns as strings, but a query param or a JSON body
  // can hand back a number. A strict === here would silently miss the cover and
  // bill a covered-away FRO for idle.
  const m = indexCovers([{ target_fro_worker_id: '42', operator_user_id: 7 }]);
  assert.equal(isCovered(m, 42), true);
  assert.equal(isCovered(m, '42'), true);
});
