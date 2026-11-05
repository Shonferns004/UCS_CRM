import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

import { writeObject } from '../services/localMedia.js';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ucs-media-route-'));
process.env.LOCAL_MEDIA_DIR = tmpRoot;
delete process.env.MEDIA_PUBLIC_BASE_URL;

const { default: mediaRoutes } = await import('./mediaRoutes.js');

const app = express();
app.use('/api/media', mediaRoutes);

const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}/api/media`;

// fetch() normalises dot segments before sending, which would hide the case we
// are testing. A raw http request keeps "%2e%2e" on the wire for Express to
// decode, exactly like a hand-crafted attack would.
const rawGet = (requestPath) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: requestPath }, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => resolve({ status: res.statusCode, body }));
  }).on('error', reject);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test('serves a stored file with a guessed content type', async () => {
  await writeObject('receipts/demo.pdf', Buffer.from('%PDF-demo'));

  const res = await fetch(`${base}/receipts/demo.pdf`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.equal(await res.text(), '%PDF-demo');
});

test('returns 404 for a missing file', async () => {
  const res = await fetch(`${base}/receipts/missing.pdf`);
  assert.equal(res.status, 404);
});

test('rejects traversal keys', async () => {
  const res = await rawGet('/api/media/%2e%2e/%2e%2e/secret.txt');
  assert.equal(res.status, 400);
});

test('sniffs an extensionless image instead of forcing a download', async () => {
  await writeObject('chat-media/chat/legacy-attachment', Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]));

  const res = await fetch(`${base}/chat-media/chat/legacy-attachment`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
});

test('supports byte ranges', async () => {
  await writeObject('fro-audio/demo.mp3', Buffer.from('0123456789'));

  const res = await fetch(`${base}/fro-audio/demo.mp3`, { headers: { Range: 'bytes=2-5' } });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await res.text(), '2345');
});
