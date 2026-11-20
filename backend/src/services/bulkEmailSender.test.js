import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSenderFromHeader,
  friendlySmtpError,
  isValidSenderEmail,
  maskSenderPassword,
  normalizeAppPassword,
  normalizeSenderEmail,
  normalizeSmtpHost,
  normalizeSmtpPort,
} from './bulkEmailSenderService.js';

test('app passwords are normalised by removing the cosmetic spaces', () => {
  assert.equal(normalizeAppPassword('abcd efgh ijkl mnop'), 'abcdefghijklmnop');
  assert.equal(normalizeAppPassword('  abcd  efgh  '), 'abcdefgh');
  assert.equal(normalizeAppPassword(null), '');
});

test('non-Google mailbox passwords keep their inner spaces', () => {
  assert.equal(normalizeAppPassword('my pass word', 'smtp.hostinger.com'), 'my pass word');
  assert.equal(normalizeAppPassword('  spaced  ', 'smtp.hostinger.com'), 'spaced');
  assert.equal(normalizeAppPassword('abcd efgh ijkl mnop', 'smtp.gmail.com'), 'abcdefghijklmnop');
});

test('SMTP host and port are normalised and validated', () => {
  assert.equal(normalizeSmtpHost(' SMTP.Hostinger.com '), 'smtp.hostinger.com');
  assert.equal(normalizeSmtpHost(''), 'smtp.gmail.com');
  assert.throws(() => normalizeSmtpHost('not a host'), /valid SMTP server/);
  assert.equal(normalizeSmtpPort('587'), 587);
  assert.equal(normalizeSmtpPort(undefined), 465);
  assert.throws(() => normalizeSmtpPort('abc'), /valid SMTP port/);
  assert.throws(() => normalizeSmtpPort(70000), /valid SMTP port/);
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

test('Hostinger auth failures point at the mailbox password, not Google', () => {
  const message = friendlySmtpError(
    new Error('Invalid login: 535 5.7.8 Authentication failed'),
    { smtp_host: 'smtp.hostinger.com' },
  );
  assert.match(message, /Hostinger/);
  assert.doesNotMatch(message, /App password/);
});

test('rate limiting is reported as such instead of as a bad password', () => {
  assert.match(
    friendlySmtpError(new Error('421 4.7.0 Too many messages, quota exceeded')),
    /rate limiting/,
  );
});
