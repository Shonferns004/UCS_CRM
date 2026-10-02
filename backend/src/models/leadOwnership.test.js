// Per-recruiter lead scoping.
//
// A recruiter used to receive every lead in the table: listLeads only applied an
// owner filter to telecallers, and for a recruiter it honoured a caller-supplied
// ?created_by= instead of forcing their own id. getLead, removeLead and the
// dashboard aggregates applied no owner filter at all. These tests pin the rule
// the model now enforces so the leak cannot come back through a "simplification".
//
// Ownership means recruiter_id = me OR created_by = me, because HR assigns work
// by setting recruiter_id while an entry typed in the panel records created_by,
// and leads created in the panel have recruiter_id = NULL.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ownsLead } from './leadModel.js';

const ME = 7;
const COLLEAGUE = 8;

const lead = (over = {}) => ({
  id: 1,
  name: 'Candidate',
  recruiter_id: null,
  created_by: null,
  ...over,
});

test('a lead entered by the recruiter is theirs', () => {
  assert.equal(ownsLead(lead({ created_by: ME }), [ME]), true);
});

test('a lead HR assigned to the recruiter is theirs', () => {
  assert.equal(ownsLead(lead({ recruiter_id: ME, created_by: COLLEAGUE }), [ME]), true);
});

test('a lead belonging to a colleague is not', () => {
  assert.equal(ownsLead(lead({ recruiter_id: COLLEAGUE, created_by: COLLEAGUE }), [ME]), false);
});

test('a lead with neither column set is not owned', () => {
  assert.equal(ownsLead(lead(), [ME]), false);
});

test('ids compare across string and number, since JWT and PostgREST differ', () => {
  assert.equal(ownsLead(lead({ created_by: 7 }), ['7']), true);
  assert.equal(ownsLead(lead({ recruiter_id: '7' }), [7]), true);
});

// Guards the edge case that would silently widen access: a NULL column must not
// be coerced to 0 and then match a real recruiter whose id is 0.
test('a NULL id never matches, including recruiter 0', () => {
  assert.equal(ownsLead(lead({ recruiter_id: null, created_by: null }), [0]), false);
});

test('ownership needs an owner, so an empty scope owns nothing', () => {
  assert.equal(ownsLead(lead({ created_by: ME }), []), false);
  assert.equal(ownsLead(lead({ created_by: ME }), [null, undefined, '']), false);
  assert.equal(ownsLead(null, [ME]), false);
});