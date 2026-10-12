// The test-send blast radius, pinned.
//
// This is the safety-critical claim about whatsappTestSend.js, and it is the
// reason that file uses an allow-list of recipient NUMBERS rather than a flag
// on a general-purpose send endpoint. If this test ever passes with an
// arbitrary number, the endpoint has become a send-to-anyone primitive.
//
// These are pure functions, so they run with no database and no Meta
// credentials.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isAllowedTestRecipient,
  testRecipientKeys,
  assertTestRecipient,
  TestSendError,
} from './whatsappTestSend.js';

const ALLOWED = '7054996353';

test('the authorised test recipient is allowed', () => {
  assert.equal(isAllowedTestRecipient(ALLOWED), true);
});

test('the authorised number is accepted in every spelling a human might type', () => {
  // The operator types this by hand. Rejecting '91 70549 96353' would be a
  // confusing failure, not a safety property.
  for (const spelling of [
    '7054996353',
    '917054996353',
    '+91 70549 96353',
    '+91-70549-96353',
    '  7054996353  ',
  ]) {
    assert.equal(isAllowedTestRecipient(spelling), true, spelling);
  }
});

test('a neighbouring digit is not the test recipient', () => {
  // The classic off-by-one: 7054996354 must not pass because it shares a prefix.
  assert.equal(isAllowedTestRecipient('7054996354'), false);
  assert.equal(isAllowedTestRecipient('917054996354'), false);
});

test('ANY other number is refused', () => {
  for (const other of [
    '9999999999',
    '919999999999',
    '9876543210',
    '705499635',
    '70549963530',
  ]) {
    assert.equal(isAllowedTestRecipient(other), false, other);
  }
});

test('nothing at all is refused -- the gate fails closed', () => {
  // A body that forgot `phone` must not resolve to an empty string that matches
  // nothing in a permissive comparison, nor fall through to some default.
  for (const missing of [null, undefined, '', '   ']) {
    assert.equal(isAllowedTestRecipient(missing), false, String(missing));
    assert.throws(() => assertTestRecipient(missing), TestSendError);
  }
});

test('a bare number is accepted, because a JSON body may carry one', () => {
  assert.equal(isAllowedTestRecipient(7054996353), true);
});

test('a non-string, non-number cannot be coerced into a pass', () => {
  // String(['7054996353']) is the allowed number. Anything that is not already a
  // string or a finite number is refused before normalisation, so the
  // comparison never runs on a value the caller did not name.
  for (const junk of [NaN, Infinity, -Infinity, [], {}, true, ['7054996353']]) {
    assert.equal(isAllowedTestRecipient(junk), false, JSON.stringify(junk));
    assert.deepEqual(testRecipientKeys(junk), [], JSON.stringify(junk));
  }
});

test('testRecipientKeys expands both spellings, like the donor matcher', () => {
  // Consistency matters: the preview reports `recipient` in 91-prefixed digits,
  // and findMatchingDonor() has to probe the donor table the same way the real
  // org routing does, or the "is this a real donor?" check would miss.
  assert.deepEqual([...testRecipientKeys('7054996353')].sort(), ['7054996353', '917054996353']);
});

test('the refusal is a 403 carrying an explanation, not a crash', () => {
  try {
    assertTestRecipient('9999999999');
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(err instanceof TestSendError);
    assert.equal(err.status, 403);
    assert.match(err.message, /No message was sent/);
  }
});