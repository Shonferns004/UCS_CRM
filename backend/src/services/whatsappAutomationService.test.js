// WhatsApp keyword automations + the 131047 retry guard.
//
// These are the two pure parts of the automation/retry surface: the keyword
// matcher the webhook evaluates on every inbound, and the failure classifier
// that decides whether a Retry button is worth showing at all. Both are written
// as pure functions precisely so they can be pinned here without a database and
// without ever touching Meta.
//
// The behaviour that most needs protecting -- an UNATTENDED send -- is the part
// deliberately NOT exercised in a test: nothing in this file sends anything.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { matchesRule, previewRules } from './whatsappAutomationService.js';
import { classifyDeliveryFailure, parseMetaErrorCode } from '../lib/whatsappErrorCodes.js';

/* ------------------------------------------------------------------ matcher */

test('matching is case-insensitive', () => {
  assert.equal(matchesRule('What are your TIMINGS?', 'timings', 'contains'), true);
  assert.equal(matchesRule('what are your timings?', 'TIMINGS', 'contains'), true);
});

test('contains matches anywhere but exact does not', () => {
  assert.equal(matchesRule('hello timings', 'timings', 'contains'), true);
  assert.equal(matchesRule('hello timings', 'timings', 'exact'), false);
  assert.equal(matchesRule('timings', 'timings', 'exact'), true);
});

test('starts_with and ends_with anchor to the right edge', () => {
  assert.equal(matchesRule('timings please', 'timings', 'starts_with'), true);
  assert.equal(matchesRule('what are the timings', 'timings', 'starts_with'), false);
  assert.equal(matchesRule('what are the timings', 'timings', 'ends_with'), true);
  assert.equal(matchesRule('timings please', 'timings', 'ends_with'), false);
});

test('whole_word respects word boundaries', () => {
  assert.equal(matchesRule('any timings today', 'timings', 'whole_word'), true);
  assert.equal(matchesRule('timingslots are open', 'timings', 'whole_word'), false);
});

test('an empty keyword never matches, so a half-saved rule cannot fire', () => {
  assert.equal(matchesRule('anything', '', 'contains'), false);
  assert.equal(matchesRule('anything', '   ', 'contains'), false);
  assert.equal(matchesRule('', 'timings', 'contains'), false);
});

test('an unknown match_type falls back to contains rather than matching nothing', () => {
  assert.equal(matchesRule('hello timings', 'timings', 'nonsense'), true);
});

/* ----------------------------------------------------------------- preview */

test('preview returns only enabled rules that match, highest priority first', () => {
  const rules = [
    { id: 1, name: 'low',  keyword: 'hours', priority: 1,  enabled: true },
    { id: 2, name: 'high', keyword: 'hours', priority: 10, enabled: true },
    { id: 3, name: 'off',  keyword: 'hours', priority: 99, enabled: false },
  ];
  const out = previewRules('what hours are you open?', rules);
  assert.deepEqual(out.map((r) => r.name), ['high', 'low']);
});

test('preview returns nothing when nothing matches', () => {
  assert.deepEqual(previewRules('unrelated', [{ id: 1, name: 'x', keyword: 'hours', enabled: true }]), []);
});

/* ------------------------------------------------- 131047 retry classifier */

test('the webhook failure_reason format yields its Meta code', () => {
  assert.equal(parseMetaErrorCode('(131047) Re-engagement message'), 131047);
});

test('a reason with no code is treated as retryable', () => {
  assert.equal(parseMetaErrorCode('Network error'), null);
  assert.equal(parseMetaErrorCode(null), null);
  assert.equal(classifyDeliveryFailure('Network error').retryable, true);
});

test('131047 is refused: retrying identical text cannot succeed', () => {
  const f = classifyDeliveryFailure('(131047) Re-engagement message');
  assert.equal(f.retryable, false);
  assert.equal(f.code, 131047);
  assert.equal(f.remedy, 'template');
});

test('template-payload failures are likewise refused with the template remedy', () => {
  for (const code of [132000, 132001, 132012, 132015]) {
    const f = classifyDeliveryFailure(`(${code}) something went wrong`);
    assert.equal(f.retryable, false, `expected ${code} to be non-retryable`);
    assert.equal(f.remedy, 'template');
  }
});

test('131026 stays retryable so a later send can still land', () => {
  const f = classifyDeliveryFailure('(131026) Message undeliverable');
  assert.equal(f.retryable, true);
  assert.equal(f.code, 131026);
});

test('an unknown Meta code keeps the previous retry behaviour', () => {
  const f = classifyDeliveryFailure('(139999) brand new failure');
  assert.equal(f.retryable, true);
  assert.equal(f.code, 139999);
});