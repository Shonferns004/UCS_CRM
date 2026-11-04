import test from 'node:test';
import assert from 'node:assert/strict';

import {
  UNDELIVERED_GRACE_MS,
  classifyLeadHistory,
  rankLeadSessions,
  whatsappDigits,
} from './leadSessionRouting.js';

const NOW = Date.parse('2026-11-04T12:00:00.000Z');
const MINUTE = 60 * 1000;
const ago = (ms) => new Date(NOW - ms).toISOString();

const incoming = (at) => ({ direction: 'incoming', status: 'read', createdAt: ago(at) });
const outgoing = (status, at) => ({ direction: 'outgoing', status, createdAt: ago(at) });

test('whatsappDigits normalises a CRM number the way the gateway resolves it', () => {
  assert.equal(whatsappDigits('9819155594'), '919819155594');
  assert.equal(whatsappDigits('+91 98191 55594'), '919819155594');
  assert.equal(whatsappDigits('098191 55594'), '919819155594');
  assert.equal(whatsappDigits('0091 98191 55594'), '919819155594');
  assert.equal(whatsappDigits(''), '');
  assert.equal(whatsappDigits(null), '');
});

test('a delivered receipt is a positive signal', () => {
  const verdict = classifyLeadHistory([outgoing('delivered', 2 * 60 * MINUTE)], NOW);
  assert.equal(verdict.state, 'delivered');
  assert.ok(verdict.score > 0);
});

test('a donor reply after our newest send proves the number works', () => {
  const verdict = classifyLeadHistory(
    [outgoing('sent', 60 * MINUTE), incoming(5 * MINUTE)],
    NOW,
  );
  assert.equal(verdict.state, 'answered');
  assert.ok(verdict.score > 0);
});

test('a send still undelivered past the grace window looks blocked', () => {
  const verdict = classifyLeadHistory(
    [outgoing('sent', UNDELIVERED_GRACE_MS + MINUTE)],
    NOW,
  );
  assert.equal(verdict.state, 'suspected-blocked');
  assert.equal(verdict.score, 0);
});

test('a send inside the grace window is only awaiting delivery', () => {
  const verdict = classifyLeadHistory([outgoing('sent', MINUTE)], NOW);
  assert.equal(verdict.state, 'awaiting-delivery');
  assert.ok(verdict.score > 0);
});

test('a failed send is the strongest negative signal', () => {
  const verdict = classifyLeadHistory([outgoing('failed', MINUTE)], NOW);
  assert.equal(verdict.state, 'failed');
  assert.ok(verdict.score < 0);
});

test('an empty history is unknown, not blocked', () => {
  assert.equal(classifyLeadHistory([], NOW).state, 'unknown');
});

test('a reply older than our newest undelivered send does not rescue the number', () => {
  const verdict = classifyLeadHistory(
    [incoming(3 * 60 * MINUTE), outgoing('sent', 60 * MINUTE)],
    NOW,
  );
  assert.equal(verdict.state, 'suspected-blocked');
});

test('ranks a replied number above an undelivered one', () => {
  const candidates = [
    { sessionId: 'bfd1', station: 'BFD-1', ngoId: 'bsct' },
    { sessionId: 'bfd2', station: 'BFD-1', ngoId: 'bsct' },
    { sessionId: 'bfd3', station: 'BFD-1', ngoId: 'bsct' },
  ];
  const histories = [
    { sessionId: 'bfd1', messages: [outgoing('sent', 2 * 60 * MINUTE)] },
    { sessionId: 'bfd2', messages: [outgoing('delivered', 3 * 60 * MINUTE)] },
    { sessionId: 'bfd3', messages: [outgoing('sent', 60 * MINUTE), incoming(10 * MINUTE)] },
  ];

  const result = rankLeadSessions(candidates, histories, NOW);
  assert.equal(result.best.sessionId, 'bfd3');
  assert.equal(result.allBlocked, false);
  assert.equal(result.blockedCount, 1);
  assert.deepEqual(
    result.ranked.map((row) => row.sessionId).slice(0, 2),
    ['bfd3', 'bfd2'],
  );
});

test('a number with no history beats one that looks blocked', () => {
  const result = rankLeadSessions(
    [
      { sessionId: 'blocked', station: 'BFD-1', ngoId: 'bsct' },
      { sessionId: 'fresh', station: 'BFD-1', ngoId: 'bsct' },
    ],
    [
      { sessionId: 'blocked', messages: [outgoing('sent', 2 * 60 * MINUTE)] },
      { sessionId: 'fresh', messages: [] },
    ],
    NOW,
  );
  assert.equal(result.best.sessionId, 'fresh');
  assert.equal(result.allBlocked, false);
});

test('a failed history read is unknown, not blocked', () => {
  const result = rankLeadSessions(
    [{ sessionId: 's1', station: 'BFD-1', ngoId: 'bsct' }],
    [{ sessionId: 's1', lookupFailed: true, messages: [] }],
    NOW,
  );
  assert.equal(result.best.sessionId, 's1');
  assert.equal(result.best.state, 'unknown');
  assert.equal(result.allBlocked, false);
});

test('all candidates blocked still picks one and reports it', () => {
  const result = rankLeadSessions(
    [
      { sessionId: 'a', station: 'BFD-1', ngoId: 'bsct' },
      { sessionId: 'b', station: 'BFD-1', ngoId: 'bsct' },
    ],
    [
      { sessionId: 'a', messages: [outgoing('failed', MINUTE)] },
      { sessionId: 'b', messages: [outgoing('sent', 60 * MINUTE)] },
    ],
    NOW,
  );
  // suspected-blocked (0) outranks failed (-100).
  assert.equal(result.best.sessionId, 'b');
  assert.equal(result.allBlocked, true);
  assert.equal(result.blockedCount, 2);
});

test('ties keep assignment order', () => {
  const result = rankLeadSessions(
    [
      { sessionId: 'first', station: 'BFD-1', ngoId: 'bsct' },
      { sessionId: 'second', station: 'BOD-1', ngoId: 'bsct' },
    ],
    [],
    NOW,
  );
  assert.equal(result.best.sessionId, 'first');
});

test('no candidates returns no best', () => {
  const result = rankLeadSessions([], [], NOW);
  assert.equal(result.best, null);
  assert.equal(result.allBlocked, false);
});
