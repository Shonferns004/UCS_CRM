// The signed link is the entire authorisation for an unauthenticated endpoint
// that streams donor documents. So these tests are mostly adversarial: the
// failure that matters is a token that validates when it should not.
//
// Receipt fixtures use obviously-fake values. Donor documents contain PAN
// numbers and addresses, and a test file is the last place a real one belongs.

import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.RECEIPT_LINK_SECRET = process.env.RECEIPT_LINK_SECRET || 'test-secret-not-for-production';

const {
  signReceiptFile, verifyReceiptFile, buildReceiptFileUrl, describeStoredObjectUrl,
  ttlMs, DEFAULT_TTL_MS, MAX_TTL_MS,
} = await import('./receiptFileLink.js');

const OK = { account: 'legacy', key: 'receipts/receipts/83574.pdf' };

test('a freshly signed token round-trips to the same account and key', () => {
  const claim = verifyReceiptFile(signReceiptFile(OK));
  assert.equal(claim.account, 'legacy');
  assert.equal(claim.key, 'receipts/receipts/83574.pdf');
});

test('every configured account is signable', () => {
  for (const account of ['head', 'upstream', 'legacy']) {
    assert.equal(verifyReceiptFile(signReceiptFile({ ...OK, account })).account, account);
  }
});

test('a tampered payload is rejected even though the signature still looks well formed', () => {
  // Re-point the token at a different donor's receipt without re-signing.
  const token = signReceiptFile(OK);
  const [payload, sig] = token.split('.');
  const decoded = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  decoded.k = 'receipts/receipts/99999.pdf';
  const forged = Buffer.from(JSON.stringify(decoded)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  assert.throws(() => verifyReceiptFile(`${forged}.${sig}`), /invalid signature/);
});

test('a swapped signature from a different token is rejected', () => {
  const a = signReceiptFile(OK);
  const b = signReceiptFile({ ...OK, key: 'receipts/receipts/88888.pdf' });
  assert.throws(() => verifyReceiptFile(`${a.split('.')[0]}.${b.split('.')[1]}`), /invalid signature/);
});

test('an expired token is refused', () => {
  const token = signReceiptFile({ ...OK, ttlMs: 1 });
  // Synchronous, so waiting is the only honest way to cross the boundary.
  const until = Date.now() + 5;
  while (Date.now() < until) { /* spin ~5ms */ }
  assert.throws(() => verifyReceiptFile(token), /link expired/);
});

test('structural garbage is rejected rather than throwing something unexpected', () => {
  for (const bad of ['', 'no-dot', 'a.b.c', '.', 'x.']) {
    assert.throws(() => verifyReceiptFile(bad), Error);
  }
  assert.throws(() => verifyReceiptFile(undefined), /missing token/);
});

test('a key that could climb out of the receipts prefix cannot even be signed', () => {
  // Traversal is unreachable via a forged token anyway (it would fail the
  // signature), but refusing to mint one keeps the invariant local and obvious.
  for (const key of ['../secrets.env', '/etc/passwd', 'receipts/../../root', '']) {
    assert.throws(() => signReceiptFile({ ...OK, key }), /unsafe object key/);
  }
});

test('an unknown storage account is refused at signing time', () => {
  assert.throws(() => signReceiptFile({ ...OK, account: 'gcs' }), /unknown storage account/);
});

test('TTL is clamped so a caller cannot mint a link that never expires', () => {
  assert.equal(ttlMs(undefined), DEFAULT_TTL_MS);
  assert.equal(ttlMs(0), DEFAULT_TTL_MS);
  assert.equal(ttlMs(-1), DEFAULT_TTL_MS);
  assert.equal(ttlMs('nonsense'), DEFAULT_TTL_MS);
  assert.equal(ttlMs(30 * 60 * 1000), 30 * 60 * 1000);
  assert.equal(ttlMs(365 * 24 * 3600 * 1000), MAX_TTL_MS);
});

test('a stored bucket URL resolves to the account that owns it, keeping the full key', () => {
  process.env.S3_BUCKET = 'ucs-crm-uploads-mumbai';
  process.env.HEAD_S3_BUCKET = 'ucs-crm-head-uploads';
  process.env.UPSTREAM_S3_BUCKET = 'some-upstream-bucket';

  const legacy = describeStoredObjectUrl('https://ucs-crm-uploads-mumbai.s3.ap-south-1.amazonaws.com/receipts/receipts/83574.pdf');
  assert.deepEqual(legacy, { account: 'legacy', key: 'receipts/receipts/83574.pdf' });

  assert.deepEqual(
    describeStoredObjectUrl('https://ucs-crm-head-uploads.s3.ap-south-1.amazonaws.com/receipts/receipts/1.pdf'),
    { account: 'head', key: 'receipts/receipts/1.pdf' }
  );
  assert.deepEqual(
    describeStoredObjectUrl('https://some-upstream-bucket.s3.ap-south-1.amazonaws.com/receipts/receipts/2.pdf'),
    { account: 'upstream', key: 'receipts/receipts/2.pdf' }
  );
});

test('a bucket this deployment does not manage resolves to null, never a guess', () => {
  assert.equal(describeStoredObjectUrl('https://someone-elses-bucket.s3.amazonaws.com/receipts/1.pdf'), null);
  assert.equal(describeStoredObjectUrl('not-a-url'), null);
  assert.equal(describeStoredObjectUrl(''), null);
});

test('the URL Meta fetches points at this API, not at the bucket', () => {
  const req = { protocol: 'https', get: (h) => (h === 'host' ? 'api.beingsevak.org' : undefined) };
  const url = buildReceiptFileUrl(req, 'TOKEN');
  assert.equal(url, 'https://api.beingsevak.org/api/whatsapp/receipt-file/TOKEN');
  assert.ok(!url.includes('amazonaws.com'), 'the private bucket must never appear in the link Meta gets');
});

test('PUBLIC_API_URL overrides the request host, with no double slash', () => {
  process.env.PUBLIC_API_URL = 'https://api.beingsevak.org/';
  const req = { protocol: 'http', get: () => 'localhost:5000' };
  assert.equal(buildReceiptFileUrl(req, 'T'), 'https://api.beingsevak.org/api/whatsapp/receipt-file/T');
  delete process.env.PUBLIC_API_URL;
});