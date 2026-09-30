/**
 * Tests for the anonymous-ballot key and the group-membership resolution.
 *
 * These three functions carry the two rules that are easy to break by accident
 * and expensive to get wrong:
 *
 *   1. resolveRoster          - who is on whose ballot. A regression here either
 *                               lets someone vote in a department they do not
 *                               belong to, or silently drops a whole group.
 *   2. resolveVoterDepartmentId - which turn this person is allowed to vote in.
 *   3. hashVoterKey           - what makes a second vote impossible, and what
 *                               makes a ballot unattributable.
 *
 * The DB-backed parts of the module are not covered here; importing this file
 * only pulls in the pg Pool, which does not open a connection until a query runs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normDept,
  deptMatches,
  hashVoterKey,
  resolveRoster,
  isExplicitRoster,
  resolveVoterDepartmentId,
  pickNextTurn,
} from '../models/votingModel.js';

const inc = (workerId) => ({ worker_id: workerId, is_excluded: false });
const exc = (workerId) => ({ worker_id: workerId, is_excluded: true });
const worker = (id) => ({ id, name: `W-${id}` });

// ── normDept ──────────────────────────────────────────────────────────────

test('normDept collapses case and surrounding whitespace', () => {
  assert.equal(normDept('  FRO  '), 'fro');
  assert.equal(normDept('Digital'), 'digital');
  assert.equal(normDept(null), '');
  assert.equal(normDept(undefined), '');
});

test('normDept treats a null and an empty string as the same group', () => {
  // workers.department is a free-text column, so "Digital", "digital" and
  // " Digital" all have to land in one group or a person gets no ballot.
  assert.equal(normDept(' Digital '), normDept('Digital'));
});

// ── resolveRoster ─────────────────────────────────────────────────────────

test('resolveRoster returns every candidate when there is no override', () => {
  const roster = resolveRoster([], [worker('a'), worker('b'), worker('c')]);
  assert.deepEqual(roster.map((w) => w.id), ['a', 'b', 'c']);
});

test('resolveRoster removes excluded workers from the department match', () => {
  // The Digital group: all Digital staff, minus the three developers who have
  // their own turn later in the ceremony.
  const candidates = [worker('a'), worker('dev1'), worker('b'), worker('dev2')];
  const roster = resolveRoster([exc('dev1'), exc('dev2')], candidates);
  assert.deepEqual(roster.map((w) => w.id), ['a', 'b']);
});

test('resolveRoster lets an explicit include-set win over the department match', () => {
  // A locked group passes only its include rows as candidates, so the
  // subtraction below must not remove them.
  const candidates = [worker('dev1'), worker('dev2'), worker('dev3')];
  const roster = resolveRoster([inc('dev1'), inc('dev2'), inc('dev3')], candidates);
  assert.deepEqual(roster.map((w) => w.id), ['dev1', 'dev2', 'dev3']);
});

test('resolveRoster compares ids by coerced string, not by identity', () => {
  // Ids arrive from three places - pg (uuid string), a query param, and the
  // saved localStorage list - and they are not always the same runtime type. A
  // worker whose id comes back as a number must still be matched by the string
  // in the member row, or the exclusion silently stops applying.
  const roster = resolveRoster([exc('101')], [{ id: 101 }, { id: 102 }]);
  assert.deepEqual(roster.map((w) => w.id), [102]);
});

test('resolveRoster does not let an include row re-add an excluded worker', () => {
  // Defence in depth: if the same id somehow carries both rows, exclusion wins.
  const roster = resolveRoster([inc('a'), exc('a')], [worker('a')]);
  assert.equal(roster.length, 0);
});

test('resolveRoster on an empty group is empty, not everyone', () => {
  assert.deepEqual(resolveRoster([], []), []);
});

// ── isExplicitRoster ──────────────────────────────────────────────────────

test('isExplicitRoster is true when the group is locked', () => {
  assert.equal(isExplicitRoster({ is_locked: true }, []), true);
});

test('isExplicitRoster is true once any member is explicitly included', () => {
  assert.equal(isExplicitRoster({ is_locked: false }, [inc('a')]), true);
});

test('isExplicitRoster is false for a plain department match', () => {
  // A group whose only rows are exclusions still matches by department.
  assert.equal(isExplicitRoster({ is_locked: false }, [exc('a')]), false);
  assert.equal(isExplicitRoster({ is_locked: false }, []), false);
});

// ── resolveVoterDepartmentId ──────────────────────────────────────────────

const FRO = { id: 1, name: 'FRO', order_index: 0, match_department: 'FRO' };
const DIGITAL = { id: 2, name: 'Digital', order_index: 1, match_department: 'Digital' };
const DEVELOPERS = { id: 3, name: 'Developers', order_index: 2, match_department: null, is_locked: true };
const HR = { id: 4, name: 'HR', order_index: 3, match_department: 'HR, HR-Recruiter' };
const DEPTS = [FRO, DIGITAL, DEVELOPERS, HR];

test('resolveVoterDepartmentId matches a plain department', () => {
  const rows = [
    { department_id: 1, worker_id: 'w1', is_excluded: false },
    { department_id: 3, worker_id: 'w9', is_excluded: false },
  ];
  assert.equal(resolveVoterDepartmentId(DEPTS, rows, 'FRO'), 1);
});

test('resolveVoterDepartmentId prefers explicit membership over a department match', () => {
  // The three developers sit in `workers.department = 'Digital'` but are also
  // explicitly listed in Developers. Explicit membership has to win, otherwise
  // they would be handed a second Digital ballot and could vote in both turns.
  const rows = [
    { department_id: 3, worker_id: 'w9', is_excluded: false },
    { department_id: 2, worker_id: 'w9', is_excluded: true },
  ];
  assert.equal(resolveVoterDepartmentId(DEPTS, rows, 'Digital'), 3);
});

test('resolveVoterDepartmentId ignores an exclusion row when assigning a voter', () => {
  // Being excluded from a group says nothing about which group you belong to.
  const rows = [{ department_id: 2, worker_id: 'w1', is_excluded: true }];
  assert.equal(resolveVoterDepartmentId(DEPTS, rows, 'Digital'), 2);
});

test('resolveVoterDepartmentId breaks ties by ceremony order', () => {
  const rows = [
    { department_id: 3, worker_id: 'w9', is_excluded: false },
    { department_id: 1, worker_id: 'w9', is_excluded: false },
  ];
  assert.equal(resolveVoterDepartmentId(DEPTS, rows, 'Digital'), 1);
});

test('resolveVoterDepartmentId returns null for a department not in the ceremony', () => {
  assert.equal(resolveVoterDepartmentId(DEPTS, [], 'CSR'), null);
  assert.equal(resolveVoterDepartmentId(DEPTS, [], null), null);
});

test('resolveVoterDepartmentId does not match a group with no department value', () => {
  // Developers has match_department = null; an unmatched person must not fall
  // into it by accident.
  assert.equal(resolveVoterDepartmentId(DEPTS, [], 'Digital'), 2);
});

// ── deptMatches: groups spanning several department labels ───────────────────

test('deptMatches matches any of the comma-separated values', () => {
  // HR is one group covering both the `HR` and `HR-Recruiter` department values.
  assert.equal(deptMatches('HR, HR-Recruiter', 'HR'), true);
  assert.equal(deptMatches('HR, HR-Recruiter', 'HR-Recruiter'), true);
  assert.equal(deptMatches(' HR, HR-Recruiter ', 'HR-Recruiter'), true);
});

test('deptMatches is false when the department is not in the list', () => {
  assert.equal(deptMatches('HR, HR-Recruiter', 'FRO'), false);
  assert.equal(deptMatches('Digital', 'HR-Recruiter'), false);
  assert.equal(deptMatches(null, 'HR'), false);
  assert.equal(deptMatches('', 'HR'), false);
});

test('resolveVoterDepartmentId routes an HR-Recruiter into the HR group', () => {
  assert.equal(resolveVoterDepartmentId(DEPTS, [], 'HR-Recruiter'), 4);
  assert.equal(resolveVoterDepartmentId(DEPTS, [], 'hr-recruiter'), 4);
});

// ── hashVoterKey ──────────────────────────────────────────────────────────

test('hashVoterKey is stable for the same turn and login', () => {
  assert.equal(hashVoterKey(7, 'shawn@ufs'), hashVoterKey(7, 'shawn@ufs'));
});

test('hashVoterKey is case- and whitespace-insensitive on the login', () => {
  // login_id is typed by hand on the voting app's login screen, so the same
  // person must hash identically however they typed it - otherwise they could
  // vote twice just by changing capitalisation.
  assert.equal(hashVoterKey(7, '  Shawn@UFS  '), hashVoterKey(7, 'shawn@ufs'));
});

test('hashVoterKey differs per turn, so one vote per person per department', () => {
  // This is what stops a person from voting in every turn of the ceremony.
  assert.notEqual(hashVoterKey(1, 'shawn@ufs'), hashVoterKey(2, 'shawn@ufs'));
});

test('hashVoterKey differs per person', () => {
  assert.notEqual(hashVoterKey(1, 'shawn@ufs'), hashVoterKey(1, 'omkar.mohite@ufs'));
});

test('hashVoterKey does not contain the login it was derived from', () => {
  // A stored hash must not be a recognisable encoding of the login_id - that
  // would be reversible by anyone with the employee list.
  const h = hashVoterKey(1, 'shawn@ufs');
  assert.ok(!h.includes('shawn'));
  assert.ok(!/shawn@ufs/i.test(h));
  assert.match(h, /^[0-9a-f]{64}$/);
});

// ── pickNextTurn: strict ceremony order ─────────────────────────────────────

const turn = (id, status) => ({ department_id: id, order_index: id, status });

test('pickNextTurn returns the first pending turn in a fresh ceremony', () => {
  assert.equal(pickNextTurn([turn(1, 'pending'), turn(2, 'pending'), turn(3, 'pending')]).department_id, 1);
});

test('pickNextTurn advances past closed turns', () => {
  assert.equal(
    pickNextTurn([turn(1, 'closed'), turn(2, 'closed'), turn(3, 'pending'), turn(4, 'pending')]).department_id,
    3,
  );
});

test('pickNextTurn returns null once everything is done or in flight', () => {
  assert.equal(pickNextTurn([turn(1, 'closed'), turn(2, 'open'), turn(3, 'expired')]), null);
});

test('pickNextTurn treats a skipped department (closed while it was pending) as done', () => {
  // HR closing a pending head is the documented "skip this department" path.
  assert.equal(pickNextTurn([turn(1, 'closed'), turn(2, 'pending')]).department_id, 2);
});

test('pickNextTurn does not pick an open turn just because it is first', () => {
  const next = pickNextTurn([turn(1, 'open'), turn(2, 'pending')]);
  assert.equal(next && next.department_id, 2);
});
