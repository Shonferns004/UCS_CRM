import { test, after } from 'node:test';
import assert from 'node:assert/strict';

import { postWhatsAppMessage, rateLimitCooldownRemaining } from './whatsappGraphSend.js';

const URL = 'https://graph.facebook.com/v23.0/111/messages';

const realFetch = globalThis.fetch;

after(() => {
  globalThis.fetch = realFetch;
});

function mockRes(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => payload,
  };
}

test('retries a rate-limited send and returns the eventual success', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return mockRes(429, { error: { code: 130429, message: 'Rate limit hit' } });
    return mockRes(200, { messages: [{ id: 'wamid.1' }] });
  };

  const data = await postWhatsAppMessage(URL, 'tok', { to: '91' }, {
    paceKey: 'ok-retry',
    baseDelayMs: 1,
    minGapMs: 0,
    cooldownMs: 1,
  });

  assert.equal(data.messages[0].id, 'wamid.1');
  assert.equal(calls, 2);
});

test('treats HTTP 200 payloads carrying 130429 as retryable', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return mockRes(400, { error: { code: 130429, message: 'Rate limit hit' } });
    return mockRes(200, { messages: [{ id: 'wamid.2' }] });
  };

  const data = await postWhatsAppMessage(URL, 'tok', {}, {
    paceKey: 'code-retry',
    baseDelayMs: 1,
    minGapMs: 0,
    cooldownMs: 1,
  });

  assert.equal(data.messages[0].id, 'wamid.2');
  assert.equal(calls, 2);
});

test('rejects with the webhook-style "(code) message" once retries are exhausted', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return mockRes(429, { error: { code: 130429, message: 'Rate limit hit' } });
  };

  await assert.rejects(
    postWhatsAppMessage(URL, 'tok', {}, { paceKey: 'exhausted', maxAttempts: 3, baseDelayMs: 1, minGapMs: 0, cooldownMs: 1 }),
    (err) => {
      assert.equal(err.message, '(130429) Rate limit hit');
      assert.equal(err.metaCode, 130429);
      return true;
    },
  );
  assert.equal(calls, 3);
});

test('permanent Meta errors are not retried', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return mockRes(400, { error: { code: 131047, message: 'Re-engagement message' } });
  };

  await assert.rejects(
    postWhatsAppMessage(URL, 'tok', {}, { paceKey: 'permanent', baseDelayMs: 1, minGapMs: 0 }),
    (err) => {
      assert.equal(err.message, '(131047) Re-engagement message');
      assert.equal(err.metaCode, 131047);
      assert.equal(err.status, 400);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test('an ambiguous network failure surfaces without a retry', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new TypeError('fetch failed');
  };

  await assert.rejects(
    postWhatsAppMessage(URL, 'tok', {}, { paceKey: 'network', baseDelayMs: 1, minGapMs: 0 }),
    /fetch failed/,
  );
  assert.equal(calls, 1);
});

test('same-key sends are serialized with the minimum gap between attempts', async () => {
  const starts = [];
  globalThis.fetch = async () => {
    starts.push(Date.now());
    return mockRes(200, { messages: [{ id: 'wamid.3' }] });
  };

  await Promise.all([
    postWhatsAppMessage(URL, 'tok', {}, { paceKey: 'paced', minGapMs: 40 }),
    postWhatsAppMessage(URL, 'tok', {}, { paceKey: 'paced', minGapMs: 40 }),
    postWhatsAppMessage(URL, 'tok', {}, { paceKey: 'paced', minGapMs: 40 }),
  ]);

  assert.equal(starts.length, 3);
  assert.ok(starts[1] - starts[0] >= 35, `gap 1-2 was ${starts[1] - starts[0]}ms`);
  assert.ok(starts[2] - starts[1] >= 35, `gap 2-3 was ${starts[2] - starts[1]}ms`);
});

test('a rejected send does not poison the queue for the next caller', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return mockRes(400, { error: { code: 131047, message: 'Re-engagement message' } });
    return mockRes(200, { messages: [{ id: 'wamid.4' }] });
  };

  const first = postWhatsAppMessage(URL, 'tok', {}, { paceKey: 'queue-heal', baseDelayMs: 1, minGapMs: 0 });
  const second = postWhatsAppMessage(URL, 'tok', {}, { paceKey: 'queue-heal', baseDelayMs: 1, minGapMs: 0 });

  await assert.rejects(first);
  const data = await second;
  assert.equal(data.messages[0].id, 'wamid.4');
  assert.equal(calls, 2);
});

test('a 130429 parks the number so the next send waits out the cooldown', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls <= 2) return mockRes(429, { error: { code: 130429, message: 'Rate limit hit' } });
    return mockRes(200, { messages: [{ id: 'wamid.5' }] });
  };

  // First send exhausts its own attempts against the limit and rejects.
  await assert.rejects(
    postWhatsAppMessage(URL, 'tok', {}, { paceKey: 'parked', maxAttempts: 2, baseDelayMs: 1, minGapMs: 0, cooldownMs: 50 }),
  );
  assert.ok(rateLimitCooldownRemaining('parked') > 0, 'number should be parked after 130429');

  // A later send on the same number waits the cooldown out, then succeeds.
  const started = Date.now();
  const data = await postWhatsAppMessage(URL, 'tok', {}, { paceKey: 'parked', baseDelayMs: 1, minGapMs: 0, cooldownMs: 50 });
  assert.equal(data.messages[0].id, 'wamid.5');
  assert.ok(Date.now() - started >= 40, `expected to wait out the cooldown, waited ${Date.now() - started}ms`);
  assert.equal(rateLimitCooldownRemaining('parked'), 0);
});
