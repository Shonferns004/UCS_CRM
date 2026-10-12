// Account selection, pinned.
//
// The assertion under test is the one that was breaking in production:
//
//   a donor's message goes out from THAT donor's organisation's number,
//   and when the organisation cannot be established nothing is sent at all.
//
// These run against the PURE helpers, so they need no database and no Meta
// credentials. The SQL layer is pinned separately, by the fact that
// requireAccountForProject() has exactly one exit that reaches `fetch()` and
// that exit requires an account whose `project` equals the resolved code.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isRoutableProject,
  phoneKeys,
  OrgRoutingError,
} from './whatsappOrgRouting.js';

// ── Which stored values count as "an organisation" ────────────────────────────

test('the real project codes are routable', () => {
  for (const p of ['bsct', 'aflf', 'mann']) {
    assert.equal(isRoutableProject(p), true, p);
  }
});

test('case and padding do not decide routability', () => {
  // whatsapp_accounts.project is unique but was written by hand, so 'MANN' and
  // ' mann ' are real stored values, not hypotheticals.
  assert.equal(isRoutableProject('MANN'), true);
  assert.equal(isRoutableProject('  Aflf  '), true);
});

test("the webhook's 'unknown' marker is NOT an organisation", () => {
  // This is the value whatsappWebhookController writes when a
  // metadata.phone_number_id matches no configured account. Letting it through
  // is precisely how an inbound got filed under BSCT and auto-answered from
  // the Being Sevak number.
  assert.equal(isRoutableProject('unknown'), false);
  assert.equal(isRoutableProject('UNKNOWN'), false);
});

test('blank, null and CSV-import string junk are not organisations', () => {
  assert.equal(isRoutableProject(null), false);
  assert.equal(isRoutableProject(undefined), false);
  assert.equal(isRoutableProject(''), false);
  assert.equal(isRoutableProject('   '), false);
  assert.equal(isRoutableProject('null'), false);
  assert.equal(isRoutableProject('undefined'), false);
});

// ── Phone key expansion ──────────────────────────────────────────────────────

test('phoneKeys expands the donor spellings so a match is possible', () => {
  // donor_profiles.mobile_number is hand-authored from imports; contacts is
  // digits-only from the webhook. Only an expanded key set can join them.
  assert.deepEqual(phoneKeys('9876543210').sort(), ['919876543210', '9876543210']);
  assert.deepEqual(phoneKeys('+91 98765-43210').sort(), ['919876543210', '9876543210']);
});

test('phoneKeys of nothing is nothing', () => {
  // An empty key set must not degrade into `.in('mobile_number', [])`, which
  // some PostgREST shims read as "no filter" and would return every donor.
  assert.deepEqual(phoneKeys(null), []);
  assert.deepEqual(phoneKeys(''), []);
  assert.deepEqual(phoneKeys('   '), []);
});

// ── The error contract ───────────────────────────────────────────────────────

test('OrgRoutingError carries the status the controller must use', () => {
  // A refused send is a 4xx with a message the agent can act on. Flattening it
  // to a 500 "Meta API error" is what made this invisible from the inbox.
  const err = new OrgRoutingError('No active WhatsApp Business number is configured', 422);
  assert.equal(err.status, 422);
  assert.equal(err.name, 'OrgRoutingError');
  assert.equal(err instanceof Error, true);
});

test('OrgRoutingError defaults to 422, not 500', () => {
  assert.equal(new OrgRoutingError('x').status, 422);
});