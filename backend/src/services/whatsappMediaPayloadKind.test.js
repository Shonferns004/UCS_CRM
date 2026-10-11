// The retry path used to send every attachment as `type: 'image'` with an
// `image: { link }` body. Worse, the kind was derived by splitting the MIME on
// "/" and taking [0] — which reads `application/pdf` as `application`, i.e.
// unrecognised, so even the FIRST send fell through to its image default. Meta
// answers 200 to the POST and only fails the fetch a minute later, as 131053
// "Media upload error", so the operator got a Retry button that could never
// succeed on any PDF or Word file.
//
// These pin the payload-kind decision, which is the whole of that bug. Pure
// functions over strings: no S3, no Meta, no database.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { mediaPayloadKind } = await import('./froWhatsAppService.js');

test('a PDF is sent as a document, even when the caller default is image', () => {
  // The regression itself, and the exact shape that reached Meta: an
  // `application/pdf` URL handed to an `image` payload.
  assert.equal(mediaPayloadKind('application/pdf', 'image'), 'document');
  assert.equal(mediaPayloadKind('application/pdf', 'document'), 'document');
});

test('every document type WhatsApp accepts maps to document, never to image', () => {
  const docs = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'text/plain',
    'text/csv',
  ];
  for (const mime of docs) assert.equal(mediaPayloadKind(mime, 'image'), 'document', mime);
});

test('each supported kind maps to its own payload key', () => {
  assert.equal(mediaPayloadKind('image/png', 'document'), 'image');
  assert.equal(mediaPayloadKind('image/jpeg', 'document'), 'image');
  assert.equal(mediaPayloadKind('audio/mpeg', 'document'), 'audio');
  assert.equal(mediaPayloadKind('audio/ogg; codecs=opus', 'document'), 'audio');
  assert.equal(mediaPayloadKind('video/mp4', 'document'), 'video');
});

test('the mime is matched case-insensitively and tolerates surrounding space', () => {
  // A stored row can carry whatever the uploader's browser sent.
  assert.equal(mediaPayloadKind('APPLICATION/PDF', 'image'), 'document');
  assert.equal(mediaPayloadKind('  Image/PNG  ', 'document'), 'image');
});

test('an unrecognisable mime takes the fallback, never a guess', () => {
  for (const mime of [null, undefined, '', '   ', 'stutter/x', 'weird', 'multipart/form-data']) {
    assert.equal(mediaPayloadKind(mime, 'document'), 'document', String(mime));
    assert.equal(mediaPayloadKind(mime, 'image'), 'image', String(mime));
  }
});

test('a top-level type with no subtype still resolves', () => {
  // prepareMediaForSend passes mimeFromKey()'s output, which is always
  // "type/subtype" — but a hand-edited row may not be.
  assert.equal(mediaPayloadKind('document', 'image'), 'document');
  assert.equal(mediaPayloadKind('video', 'document'), 'video');
  assert.equal(mediaPayloadKind('image', 'document'), 'image');
});

test('stutter is resolved rather than echoed into the payload', () => {
  assert.equal(mediaPayloadKind('stutter/image', 'document'), 'document');
  assert.equal(mediaPayloadKind('image/svg+xml', 'document'), 'image');
});