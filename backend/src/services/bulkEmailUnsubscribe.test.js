import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendUnsubscribeHtml,
  appendUnsubscribeText,
  buildUnsubscribeToken,
  buildUnsubscribeUrl,
  verifyUnsubscribeToken,
} from './bulkEmailUnsubscribe.js';

process.env.UNSUBSCRIBE_SECRET = 'test-unsubscribe-secret';

test('unsubscribe token round-trips and normalizes the email', () => {
  const token = buildUnsubscribeToken('Donor@Example.com');
  assert.equal(verifyUnsubscribeToken(token), 'donor@example.com');
});

test('tampered or malformed tokens are rejected', () => {
  const token = buildUnsubscribeToken('donor@example.com');
  assert.equal(verifyUnsubscribeToken(`${token}x`), null);
  assert.equal(verifyUnsubscribeToken('not-a-token'), null);
  assert.equal(verifyUnsubscribeToken(''), null);
});

test('buildUnsubscribeToken rejects invalid emails', () => {
  assert.throws(() => buildUnsubscribeToken('not-an-email'), /valid email/);
});

test('buildUnsubscribeUrl creates an absolute unsubscribe link', () => {
  const url = buildUnsubscribeUrl('https://api.example.org/', 'donor@example.com');
  assert.match(url, /^https:\/\/api\.example\.org\/api\/unsubscribe\?token=/);
  const token = decodeURIComponent(url.split('token=')[1]);
  assert.equal(verifyUnsubscribeToken(token), 'donor@example.com');
});

test('html unsubscribe footer is inserted before </body>', () => {
  const html = '<html><body><p>Hello</p></body></html>';
  const output = appendUnsubscribeHtml(html, 'https://api.example.org/api/unsubscribe?token=abc');
  assert.match(output, /Unsubscribe/);
  assert.ok(output.indexOf('Unsubscribe') < output.indexOf('</body>'));
});

test('text unsubscribe footer is appended once', () => {
  const output = appendUnsubscribeText('Hello donor\n', 'https://api.example.org/api/unsubscribe?token=abc');
  assert.match(output, /To unsubscribe from future emails, visit:/);
  assert.match(output, /token=abc/);
});
