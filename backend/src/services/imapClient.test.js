import test from 'node:test';
import assert from 'node:assert/strict';
import { createImapClient, isImapTransportError } from './imapClient.js';

// Regression: a mailbox socket timeout used to be emitted as an unhandled
// 'error' event, which Node turns into an uncaught exception and crashes the
// whole API. Every client built here must consume that event instead.
test('an IMAP socket timeout is consumed instead of crashing the process', () => {
  const client = createImapClient(
    { host: 'imap.example.org', port: 993, secure: true, auth: { user: 'a@b.c', pass: 'x' } },
    'test',
  );

  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.join(' '));

  try {
    const error = Object.assign(new Error('Socket timeout'), { code: 'ETIMEOUT' });
    assert.doesNotThrow(() => client.emit('error', error));
    assert.equal(client.listenerCount('error') >= 1, true);
    assert.match(logged.join('\n'), /Socket timeout/);
  } finally {
    console.error = originalError;
  }
});

test('only transport failures are treated as recoverable', () => {
  assert.equal(isImapTransportError(Object.assign(new Error('Socket timeout'), { code: 'ETIMEOUT' })), true);
  assert.equal(isImapTransportError(Object.assign(new Error('reset'), { code: 'ECONNRESET' })), true);
  assert.equal(isImapTransportError(Object.assign(new Error('auth'), { code: 'EAUTH' })), false);
  assert.equal(isImapTransportError(new Error('Authentication failed')), false);
  assert.equal(isImapTransportError(null), false);
});
