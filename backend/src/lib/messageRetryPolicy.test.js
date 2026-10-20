// Retry policy for webhook-failed outbound messages (130429 and friends).
//
// The scheduler (services/messageRetryScheduler.js) turns these decisions
// into claims and sends; everything here is pure so it runs with plain
// node:test and no database.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RETRY_DELAYS_MS,
  MAX_AUTO_RETRIES,
  FAILURE_FRESHNESS_MS,
  retryKindFor,
  retryDecision,
  delayForAttempts,
  attemptsFor,
} from './messageRetryPolicy.js';

const NOW = Date.parse('2026-10-19T12:00:00.000Z');

function templateRow(overrides = {}) {
  return {
    id: 'm-1',
    direction: 'outbound',
    status: 'failed',
    message_category: 'template',
    template_id: 'navratri',
    template_params: { kind: 'whatsapp_template', name: 'navratri', params: ['x'] },
    failure_reason: '(130429) Rate limit hit',
    body_text: 'Dear Donor',
    status_updated_at: '2026-10-19T11:55:00.000Z',
    created_at: '2026-10-19T11:54:00.000Z',
    ...overrides,
  };
}

function froRow(overrides = {}) {
  return {
    id: 'm-2',
    direction: 'outbound',
    status: 'failed',
    message_category: 'fro_reply',
    template_params: null,
    failure_reason: '(130429) Rate limit hit',
    body_text: 'hello donor',
    media_url: null,
    status_updated_at: '2026-10-19T11:55:00.000Z',
    created_at: '2026-10-19T11:54:00.000Z',
    ...overrides,
  };
}

test('ladder: 1m, 5m, 15m — three automatic retries', () => {
  assert.deepEqual(RETRY_DELAYS_MS, [60_000, 300_000, 900_000]);
  assert.equal(MAX_AUTO_RETRIES, 3);
  assert.equal(delayForAttempts(0), 60_000);
  assert.equal(delayForAttempts(1), 300_000);
  assert.equal(delayForAttempts(2), 900_000);
  assert.equal(delayForAttempts(3), null, 'ladder exhausted');
  assert.equal(delayForAttempts(-1), null);
  assert.equal(delayForAttempts(1.5), null);
});

test('a fresh failed template row with stored variables is eligible', () => {
  const row = templateRow();
  assert.equal(retryKindFor(row), 'template');
  const d = retryDecision(row, { now: NOW });
  assert.ok(d);
  assert.equal(d.kind, 'template');
  assert.equal(d.attempts, 0);
  assert.equal(d.delayMs, 60_000);
});

test('a fresh failed fro_reply text row is eligible', () => {
  const d = retryDecision(froRow(), { now: NOW });
  assert.ok(d);
  assert.equal(d.kind, 'plain');
  assert.equal(d.attempts, 0);
});

test('media-only fro_reply rows (no body) still retry', () => {
  const d = retryDecision(froRow({ body_text: '', media_url: 'https://bucket/x.pdf' }), { now: NOW });
  assert.ok(d);
  assert.equal(d.kind, 'plain');
});

test('131047 and other permanent codes are never retried', () => {
  assert.equal(retryKindFor(templateRow({ failure_reason: '(131047) Re-engagement message' })), null);
  assert.equal(retryKindFor(templateRow({ failure_reason: '(132000) Template paused' })), null);
  assert.equal(retryDecision(froRow({ failure_reason: '(131047) Re-engagement message' }), { now: NOW }), null);
});

test('a reason with no code stays retryable (unknown = transient)', () => {
  const d = retryDecision(templateRow({ failure_reason: 'Network error' }), { now: NOW });
  assert.ok(d);
  assert.equal(d.kind, 'template');
});

test('the attempt cap stops the automatic ladder', () => {
  const row = templateRow({ template_params: { kind: 'whatsapp_template', params: ['x'], autoRetries: 3 } });
  assert.equal(retryDecision(row, { now: NOW }), null);
  assert.equal(attemptsFor(row), 3);
  const under = templateRow({ template_params: { kind: 'whatsapp_template', params: ['x'], autoRetries: 2 } });
  const d = retryDecision(under, { now: NOW });
  assert.ok(d, 'two of three retries used still goes on');
  assert.equal(d.attempts, 2);
  assert.equal(d.delayMs, 900_000, 'third retry waits the last ladder step');
});

test('stale failures are not auto-retried but manual retries still work', () => {
  const stale = templateRow({ status_updated_at: '2026-10-19T09:00:00.000Z' }); // 3h old
  assert.equal(retryDecision(stale, { now: NOW }), null);
  assert.ok(retryDecision(stale, { manual: true, now: NOW }), 'agent asked explicitly');
});

test('the freshness boundary is inclusive', () => {
  const edge = templateRow({ status_updated_at: new Date(NOW - FAILURE_FRESHNESS_MS).toISOString() });
  assert.ok(retryDecision(edge, { now: NOW }));
});

test('manual retries ignore the attempt cap', () => {
  const capped = templateRow({ template_params: { kind: 'whatsapp_template', params: ['x'], autoRetries: 9 } });
  const d = retryDecision(capped, { manual: true, now: NOW });
  assert.ok(d);
  assert.equal(d.attempts, 9);
});

test('rows Meta never failed are out', () => {
  assert.equal(retryKindFor(templateRow({ status: 'sent' })), null);
  assert.equal(retryKindFor(templateRow({ status: 'read' })), null);
  assert.equal(retryKindFor(templateRow({ status: 'queued' })), null);
  assert.equal(retryKindFor(templateRow({ direction: 'inbound' })), null);
  assert.equal(retryKindFor(null), null);
  assert.equal(retryKindFor(undefined), null);
});

test('template rows cannot be rebuilt without stored variables', () => {
  // Rows written before template_params.params existed: the rendered body
  // cannot be split back into variables, so a retry could send blanks.
  assert.equal(retryKindFor(templateRow({ template_params: { kind: 'whatsapp_template', name: 'navratri' } })), null);
  // Receipt bookkeeping rows are message_category 'template' but have no
  // template_id and were never "sent" by the FRO path.
  assert.equal(retryKindFor(templateRow({ template_id: null })), null);
  assert.equal(retryKindFor(templateRow({ template_params: { parameters: ['x'] } })), null);
});

test('categories whose senders cannot rebuild a payload are excluded', () => {
  for (const category of ['ai_reply', 'automation', 'interactive', 'service', null]) {
    assert.equal(
      retryKindFor(froRow({ message_category: category, template_id: undefined })),
      null,
      `category ${category}`,
    );
  }
});

test('a fro_reply row with neither body nor media has nothing to resend', () => {
  assert.equal(retryKindFor(froRow({ body_text: '', media_url: null })), null);
});

test('rows without a status_updated_at or created_at are not auto-retried', () => {
  const noTime = templateRow({ status_updated_at: null, created_at: null });
  assert.equal(retryDecision(noTime, { now: NOW }), null);
  assert.ok(retryDecision(noTime, { manual: true, now: NOW }));
});
