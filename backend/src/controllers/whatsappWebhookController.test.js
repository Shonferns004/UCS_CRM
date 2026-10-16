// Webhook replay behaviour, pinned without a database.
//
// Two properties that are invisible until they break in production:
//
//   1. DELIVERY STATUS ORDERING. Meta delivers status frames out of order and
//      redelivers them. A read receipt that gets walked back to "sent" is lost
//      permanently, so the rank guard has to hold under any arrival order.
//
//   2. RECEIPT IS MATCHED ON wamid, NOT ON PROJECT. A status frame names only
//      the Meta message id. Scoping the update by project or by conversation is
//      what lets one organisation's status frame overwrite another's row.
//
// shouldApplyStatus() is the pure decision; it was extracted from the handler
// for exactly this test.

import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldApplyStatus } from './whatsappWebhookController.js';

// ── Forward progress ────────────────────────────────────────────────────────

test('each status advances on its predecessor', () => {
  assert.equal(shouldApplyStatus('queued', 'sent'), true);
  assert.equal(shouldApplyStatus('sent', 'delivered'), true);
  assert.equal(shouldApplyStatus('delivered', 'read'), true);
});

test('applying the same status twice is harmless', () => {
  // Meta redelivers status frames; the handler's compare-and-swap on
  // `status` turns a repeat into a no-op rather than a second write.
  assert.equal(shouldApplyStatus('sent', 'sent'), true);
  assert.equal(shouldApplyStatus('read', 'read'), true);
});

// ── The regression that loses read receipts ─────────────────────────────────

test('a redelivered "sent" cannot walk a read receipt back', () => {
  // This is the whole reason the rank guard exists. Without it the bubble
  // silently drops from "read" to "sent" and the operator sees a message they
  // know was read as merely sent.
  assert.equal(shouldApplyStatus('read', 'sent'), false);
  assert.equal(shouldApplyStatus('read', 'delivered'), false);
});

test('"delivered" cannot walk back to "queued" or "sent"', () => {
  assert.equal(shouldApplyStatus('delivered', 'sent'), false);
  assert.equal(shouldApplyStatus('delivered', 'accepted'), false);
  assert.equal(shouldApplyStatus('queued', 'accepted'), true, 'accepted and queued share rank 1');
});

// ── "failed" is terminal ────────────────────────────────────────────────────

test('nothing overwrites a failed message', () => {
  // A later success frame would erase failure_reason, which is the only thing
  // telling the agent why the send did not go out.
  for (const later of ['sent', 'delivered', 'read']) {
    assert.equal(shouldApplyStatus('failed', later), false, later);
  }
});

test('a failed frame does apply to a message that is not yet read', () => {
  assert.equal(shouldApplyStatus('queued', 'failed'), true);
  assert.equal(shouldApplyStatus('sent', 'failed'), true);
  assert.equal(shouldApplyStatus('delivered', 'failed'), true);
});

test('a failure never overwrites proof of delivery', () => {
  // The donor read it. A "failed" frame after "read" is a stale or mismatched
  // frame, and honouring it would show the agent a red bubble for a message the
  // donor demonstrably received.
  assert.equal(shouldApplyStatus('read', 'failed'), false);
});

// ── Unknown values ──────────────────────────────────────────────────────────

test('an unknown status is recorded rather than dropped', () => {
  // Meta adds statuses over time. A new one must not silently stop being
  // persisted, which is what a rank comparison with an undefined operand
  // would cause if written the other way round.
  assert.equal(shouldApplyStatus('sent', 'deleted'), true);
  assert.equal(shouldApplyStatus('sent', 'some_future_status'), true);
});

test('a null current status is treated as queued', () => {
  // messages.status has a column default of 'queued', but a row written before
  // that default existed, or by a path that passed null, must still advance.
  assert.equal(shouldApplyStatus(null, 'sent'), true);
  assert.equal(shouldApplyStatus(undefined, 'delivered'), true);
  assert.equal(shouldApplyStatus(null, 'failed'), true);
});

// ── A full replay, in the order Meta actually delivers ──────────────────────

test('replaying frames out of order still lands on the furthest state', () => {
  // Meta's real sequence for one message, deliberately shuffled: the read
  // receipt arrives first, then a duplicate delivered, then the sent it was
  // always going to be.
  const frames = ['read', 'delivered', 'delivered', 'sent', 'read'];
  let status = 'queued';
  for (const f of frames) {
    if (shouldApplyStatus(status, f)) status = f;
  }
  assert.equal(status, 'read');
});

test('a replay that includes a stale failure still ends on read', () => {
  const frames = ['sent', 'read', 'failed', 'delivered', 'sent'];
  let status = 'queued';
  for (const f of frames) {
    if (shouldApplyStatus(status, f)) status = f;
  }
  assert.equal(status, 'read');
});