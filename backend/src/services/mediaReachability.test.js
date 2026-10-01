// Attachment preflight for WhatsApp template sends.
//
// The behaviour under test is the guard that stops a receipt send being reported
// as successful when the receipt PDF is not actually downloadable by Meta. The
// failure this exists for was silent: POST /messages returns 200, the Accounts
// panel clears the row, and error 131053 only surfaces minutes later on the
// webhook. So the assertions are about *refusing to bless an unreachable URL*,
// not about any Meta interaction.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkAttachmentReachable, describeUnreachableAttachment } from './mediaReachability.js';

const URL_UNDER_TEST = 'https://receipts.example.invalid/receipts/r1.pdf';

const stubFetch = (handler) => {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, ...init });
    return handler(url, init);
  };
  impl.calls = calls;
  return impl;
};

const statusResponse = (status) => ({ status, statusText: `status ${status}` });

test('a publicly readable attachment passes on the cheap HEAD probe', async () => {
  const fetchImpl = stubFetch(() => statusResponse(200));
  const result = await checkAttachmentReachable(URL_UNDER_TEST, { fetchImpl });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.method, 'HEAD');
  // HEAD first: a 600KB receipt should not be downloaded just to be checked.
  assert.equal(fetchImpl.calls.length, 1);
});

test('a ranged GET 206 counts as readable', async () => {
  const fetchImpl = stubFetch(() => statusResponse(206));
  const result = await checkAttachmentReachable(URL_UNDER_TEST, { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.status, 206);
});

test('the 403 that broke every production send is reported, not swallowed', async () => {
  const fetchImpl = stubFetch(() => statusResponse(403));
  const result = await checkAttachmentReachable(URL_UNDER_TEST, { fetchImpl });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.reason, 'http');
  assert.equal(result.method, 'HEAD', 'a hard refusal must not be retried with another verb');
  assert.equal(fetchImpl.calls.length, 1);
});

test('a 403 explanation names the S3 permission problem, not the donor', () => {
  const message = describeUnreachableAttachment(URL_UNDER_TEST, { status: 403, reason: 'http' });

  assert.match(message, /not publicly readable/i);
  assert.match(message, /HTTP 403/);
  assert.match(message, /s3:GetObject/);
  assert.match(message, /receipts\.example\.invalid/);
  // The operator's first question is "is this my template or my donor?" and the
  // answer is neither. The message has to say so or the next person re-uploads
  // the PDF for the fifth time.
  assert.match(message, /not a\s+donor or template problem/i);
});

test('a missing object is described as a readback failure', () => {
  const message = describeUnreachableAttachment(URL_UNDER_TEST, { status: 404, reason: 'http' });
  assert.match(message, /not at the URL/i);
  assert.match(message, /cannot be read back/i);
});

test('a host that refuses HEAD is retried with a ranged GET', async () => {
  const fetchImpl = stubFetch((_url, init) => (
    init.method === 'HEAD' ? statusResponse(405) : statusResponse(200)
  ));
  const result = await checkAttachmentReachable(URL_UNDER_TEST, { fetchImpl });

  assert.equal(result.ok, true);
  assert.equal(result.method, 'GET');
  assert.deepEqual(fetchImpl.calls.map(c => c.method), ['HEAD', 'GET']);
  assert.equal(fetchImpl.calls[1].headers.Range, 'bytes=0-0', 'the fallback GET must not pull the whole PDF');
});

test('a host that refuses both verbs ends up reporting the GET verdict', async () => {
  const fetchImpl = stubFetch((_url, init) => (
    init.method === 'HEAD' ? statusResponse(405) : statusResponse(403)
  ));
  const result = await checkAttachmentReachable(URL_UNDER_TEST, { fetchImpl });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.method, 'GET');
});

test('a silent host is reported as a timeout, not as a broken bucket', async () => {
  const fetchImpl = stubFetch(async () => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    throw err;
  });
  const result = await checkAttachmentReachable(URL_UNDER_TEST, { fetchImpl, timeoutMs: 25 });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'timeout');
  assert.equal(result.status, 0);
  assert.equal(result.timeoutMs, 25);
  assert.match(describeUnreachableAttachment(URL_UNDER_TEST, result), /25ms/);
});

test('a DNS or TLS failure is reported as a network problem', async () => {
  const fetchImpl = stubFetch(async () => { throw new Error('getaddrinfo ENOTFOUND receipts.example.invalid'); });
  const result = await checkAttachmentReachable(URL_UNDER_TEST, { fetchImpl });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'network');
  assert.match(result.error, /ENOTFOUND/);
  assert.match(describeUnreachableAttachment(URL_UNDER_TEST, result), /could not be reached/i);
});

test('a probe with no URL fails closed instead of waving the send through', async () => {
  const fetchImpl = stubFetch(() => statusResponse(200));
  const result = await checkAttachmentReachable('', { fetchImpl });

  assert.equal(result.ok, false, 'an empty attachment URL must never be treated as reachable');
  assert.equal(fetchImpl.calls.length, 0);
});

test('redirects are followed so a CDN redirect is not read as a refusal', async () => {
  const fetchImpl = stubFetch(() => statusResponse(200));
  await checkAttachmentReachable(URL_UNDER_TEST, { fetchImpl });
  assert.equal(fetchImpl.calls[0].redirect, 'follow');
});