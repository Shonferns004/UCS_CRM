// Deleted-message audit — unit tests for the pure delete-intent parser.
//
// The passthrough records an audit row only when this parser says "this was a message
// delete". A false positive would attribute a delete that never happened (the log stops
// being evidence); a false negative drops the actor from a real delete, which is exactly what
// the deleted-message log exists to answer. Both directions are pinned here.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseMessageDeleteRequest } from './whatsappMessageDeleteIntent.js';

const SESSION = 'db55cbc8-1702-4a64-bf7d-2fb8fa3c92f2';
const DELETE_PATH = `sessions/${SESSION}/messages/delete`;

test('reads the gateway delete call as a delete intent', () => {
  assert.deepEqual(
    parseMessageDeleteRequest({
      method: 'POST',
      subPath: DELETE_PATH,
      body: { chatId: '917506419340@c.us', messageId: 'false_123', forEveryone: true },
    }),
    {
      sessionId: SESSION,
      messageId: 'false_123',
      chatId: '917506419340@c.us',
      forEveryone: true,
    },
  );
});

test('defaults forEveryone to true and tolerates a missing chatId', () => {
  const intent = parseMessageDeleteRequest({
    method: 'POST',
    subPath: DELETE_PATH,
    body: { messageId: ' m1 ' },
  });
  assert.equal(intent.forEveryone, true);
  assert.equal(intent.messageId, 'm1');
  assert.equal(intent.chatId, null);
});

test('keeps an explicit delete-for-me distinct', () => {
  const intent = parseMessageDeleteRequest({
    method: 'POST',
    subPath: DELETE_PATH,
    body: { chatId: 'c@c.us', messageId: 'm1', forEveryone: false },
  });
  assert.equal(intent.forEveryone, false);
});

test('accepts the query string the passthrough appends', () => {
  const intent = parseMessageDeleteRequest({
    method: 'POST',
    subPath: `${DELETE_PATH}?trace=1`,
    body: { messageId: 'm1' },
  });
  assert.equal(intent?.sessionId, SESSION);
});

test('decodes an escaped session id', () => {
  const intent = parseMessageDeleteRequest({
    method: 'POST',
    subPath: 'sessions/a%20b/messages/delete',
    body: { messageId: 'm1' },
  });
  assert.equal(intent?.sessionId, 'a b');
});

test('ignores every other gateway call', () => {
  for (const [method, subPath] of [
    ['POST', `sessions/${SESSION}/messages/send-text`],
    ['POST', `sessions/${SESSION}/messages/react`],
    ['POST', `sessions/${SESSION}/chats/delete`],
    ['POST', `sessions/${SESSION}/messages/edit`],
    ['GET', DELETE_PATH],
    ['POST', `sessions/${SESSION}/messages/delete-extra`],
    ['POST', 'sessions//messages/delete'],
    ['POST', ''],
  ]) {
    assert.equal(
      parseMessageDeleteRequest({ method, subPath, body: { messageId: 'm1' } }),
      null,
      `${method} ${subPath} must not read as a message delete`,
    );
  }
});

test('ignores a delete call with no message id', () => {
  for (const body of [{}, { messageId: '' }, { messageId: '   ' }, undefined]) {
    assert.equal(parseMessageDeleteRequest({ method: 'POST', subPath: DELETE_PATH, body }), null);
  }
});

test('ignores a malformed session escape instead of throwing', () => {
  assert.equal(
    parseMessageDeleteRequest({
      method: 'POST',
      subPath: 'sessions/%E0%A4%A/messages/delete',
      body: { messageId: 'm1' },
    }),
    null,
  );
});
