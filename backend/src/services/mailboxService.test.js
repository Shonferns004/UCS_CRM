import test from 'node:test';
import assert from 'node:assert/strict';
import { imapConfigForSender, replySubject } from './mailboxService.js';

test('IMAP host follows the SMTP provider instead of always Gmail', () => {
  assert.equal(
    imapConfigForSender({ email: 'csr@beingsevak.org', smtp_host: 'smtp.hostinger.com' }).host,
    'imap.hostinger.com',
  );
  assert.equal(
    imapConfigForSender({ email: 'ngo@gmail.com', smtp_host: 'smtp.gmail.com' }).host,
    'imap.gmail.com',
  );
  assert.equal(
    imapConfigForSender({ email: 'a@example.org', smtp_host: 'mail.example.org' }).host,
    'imap.example.org',
  );
});

test('IMAP always uses port 993 over TLS with the full email as username', () => {
  const config = imapConfigForSender({
    email: 'csr@beingsevak.org',
    smtp_host: 'smtp.hostinger.com',
    app_password: 'secret',
  });
  assert.equal(config.port, 993);
  assert.equal(config.secure, true);
  assert.equal(config.auth.user, 'csr@beingsevak.org');
  assert.equal(config.auth.pass, 'secret');
});

test('password normalisation stays provider aware for IMAP too', () => {
  assert.equal(
    imapConfigForSender({ email: 'x@gmail.com', smtp_host: 'smtp.gmail.com', app_password: 'abcd efgh ijkl mnop' }).auth.pass,
    'abcdefghijklmnop',
  );
  assert.equal(
    imapConfigForSender({ email: 'csr@beingsevak.org', smtp_host: 'smtp.hostinger.com', app_password: 'my pass' }).auth.pass,
    'my pass',
  );
});

test('reply subjects get a single Re: prefix', () => {
  assert.equal(replySubject('An update from Being Sevak'), 'Re: An update from Being Sevak');
  assert.equal(replySubject('Re: An update'), 'Re: An update');
  assert.equal(replySubject('RE: donation'), 'RE: donation');
  assert.equal(replySubject(''), 'Re: (no subject)');
});
