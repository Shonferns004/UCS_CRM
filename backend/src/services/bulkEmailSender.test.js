import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSenderFromHeader,
  friendlySmtpError,
  isValidSenderEmail,
  maskSenderPassword,
  normalizeAppPassword,
  normalizeSenderEmail,
} from './bulkEmailSenderService.js';

test('app passwords are normalised by removing the cosmetic spaces', () => {
  assert.equal(normalizeAppPassword('abcd efgh ijkl mnop'), 'abcdefghijklmnop');
  assert.equal(normalizeAppPassword('  abcd  efgh  '), 'abcdefgh');
  assert.equal(normalizeAppPassword(null), '');
});

test('sender emails are trimmed and lowercased', () => {
  assert.equal(normalizeSenderEmail('  BeingSevak@Gmail.com '), 'beingsevak@gmail.com');
  assert.equal(normalizeSenderEmail(undefined), '');
});

test('invalid sender emails are rejected', () => {
  assert.equal(isValidSenderEmail('beingsevak@gmail.com'), true);
  assert.equal(isValidSenderEmail('not-an-email'), false);
  assert.equal(isValidSenderEmail(''), false);
});

test('masked passwords never expose the stored value', () => {
  assert.equal(maskSenderPassword('abcdefghijklmnop'), '••••••••');
  assert.equal(maskSenderPassword(''), null);
  assert.equal(maskSenderPassword(null), null);
});

test('from header uses the display name, falling back to the NGO name', () => {
  assert.equal(
    buildSenderFromHeader({ email: 'beingsevakngo@gmail.com', display_name: 'Being Sevak Charitable Trust' }),
    'Being Sevak Charitable Trust <beingsevakngo@gmail.com>',
  );
  assert.equal(
    buildSenderFromHeader({ email: 'Ngo2@Gmail.com' }),
    'Being Sevak Charitable Trust <ngo2@gmail.com>',
  );
  assert.equal(
    buildSenderFromHeader({ email: 'ngo3@gmail.com', display_name: 'NGO "Events"' }),
    'NGO Events <ngo3@gmail.com>',
  );
  assert.throws(() => buildSenderFromHeader({}), /not configured/);
});

test('SMTP auth failures become an actionable message', () => {
  assert.match(
    friendlySmtpError(new Error('Invalid login: 535-5.7.8 Username and Password not accepted')),
    /App password is wrong or has been revoked/,
  );
  assert.match(friendlySmtpError(new Error('getaddrinfo ENOTFOUND smtp.gmail.com')), /Could not connect/);
  assert.equal(friendlySmtpError(new Error('something else')), 'something else');
});
