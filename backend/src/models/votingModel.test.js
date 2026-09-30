/**
 * Tests for the anonymous-ballot key and the group-membership resolution.
 *
 * These functions carry the rules that are easy to break by accident and
 * expensive to get wrong:
 *
 *   1. resolveRoster    - who is on a department's ballot. A regression here
 *                          either drops a whole group or adds the wrong people.
 *   2. deptMatches      - a group spanning several department labels, e.g. HR
 *                          covering both `HR` and `HR-Recruiter`.
 *   3. hashVoterKey     - what makes a second vote impossible, and what makes a
 *                          ballot unattributable.
 *
 * There is no voter→group resolution any more: every employee votes in every
 * department, so a ballot is chosen by department rather than by who you are.
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

test('deptMatches is false for a group with no department value', () => {
  // Developers is an explicit roster with match_department = null, so no
  // department label should fall into it.
  assert.equal(deptMatches(null, 'Digital'), false);
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
  // Every department is its own ballot and everybody votes in all of them, so
  // the digest is scoped per department: one vote each, not one per ceremony.
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
