// Claim attribution: operator_id -> name.
//
// During a Work As / cover session the CLAIM is stored with fro_worker_id =
// the COVERED FRO and operator_id = the ACTOR, and Accounts must show the
// person who actually claimed. operator_id has no FK (it spans workers and
// users — migrations/182), so the name is resolved by asking both tables. This
// pins the merge rule that decides which table wins.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mergeOperatorNameRows, resolveOperatorNames } from './operatorNameService.js';

test('workers wins over users on an id collision', () => {
  const map = mergeOperatorNameRows([
    [{ id: 'x', name: 'A Worker', login_id: 'w1' }],
    [{ id: 'x', name: 'An Admin', email: 'admin@x' }],
  ]);
  assert.equal(map.get('x').name, 'A Worker');
  assert.equal(map.get('x').label, 'A Worker');
  assert.equal(map.get('x').login, 'w1');
});

test('a source only contributes ids it actually resolved', () => {
  const map = mergeOperatorNameRows([
    [{ id: 'w', name: 'Worker One', login_id: 'w1' }],
    [{ id: 'u', name: 'User One', email: 'u@x' }],
  ]);
  assert.equal(map.size, 2);
  assert.equal(map.get('u').name, 'User One');
});

test('ids are keyed as strings so uuid formatting cannot miss', () => {
  const map = mergeOperatorNameRows([[{ id: 42, name: 'Numeric Id' }]]);
  assert.equal(map.get('42').name, 'Numeric Id');
});

test('every operator credits to its own workers id', () => {
  const map = mergeOperatorNameRows([
    [{ id: 'w1', name: 'A Worker', login_id: 'w1' }],
    [{ id: 'u1', name: 'An Admin', email: 'a@x' }],
  ]);
  assert.equal(map.get('w1').workerId, 'w1', 'a worker credits to itself');
  assert.equal(map.get('u1').workerId, 'u1');
});

test('blank rows and blank ids are skipped, not mapped to empty names', () => {
  const map = mergeOperatorNameRows([[null, {}, { id: '', name: 'Nope' }, { id: null }]]);
  assert.equal(map.size, 0);
});

test('a worker-as-worker cover is its own label — one name, not two', () => {
  const map = mergeOperatorNameRows([[{ id: 'w', name: 'Muskan Khan', login_id: 'muskan.khan@ufs' }]]);
  const row = map.get('w');
  assert.equal(row.name, row.label);
});

test('an empty input resolves to an empty map without touching the database', async () => {
  assert.equal((await resolveOperatorNames([])).size, 0);
  assert.equal((await resolveOperatorNames([null, '', undefined])).size, 0);
});
