import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  localUrlForKey,
  writeObject,
} from './localMedia.js';
import { loadMediaBytesForUpload } from './whatsappService.js';

// localMedia exports no remove helper; use fs directly via mediaRoot indirection is awkward.
// We'll track temp dir and clean it up.

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wa-media-'));
}

test('loadMediaBytesForUpload reads a local stored object without fetching', async (t) => {
  const dir = makeTempDir();
  const prevStorage = process.env.MEDIA_STORAGE;
  const prevDir = process.env.LOCAL_MEDIA_DIR;
  process.env.MEDIA_STORAGE = 'local';
  process.env.LOCAL_MEDIA_DIR = dir;
  t.after(() => {
    if (prevStorage === undefined) delete process.env.MEDIA_STORAGE; else process.env.MEDIA_STORAGE = prevStorage;
    if (prevDir === undefined) delete process.env.LOCAL_MEDIA_DIR; else process.env.LOCAL_MEDIA_DIR = prevDir;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const key = 'whatsapp-media/template-headers/mann2/_flour_mill_distribution';
  const bytes = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4]);
  await writeObject(key, bytes);

  const url = localUrlForKey(key);
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; throw new Error('fetch should not be called'); };
  t.after(() => { globalThis.fetch = originalFetch; });

  const loaded = await loadMediaBytesForUpload(url, 'image');
  assert.equal(fetchCalled, false);
  assert.deepEqual(Buffer.from(loaded.buffer), bytes);
  assert.equal(loaded.fromStorage, true);
  assert.equal(loaded.contentType, 'image/jpeg');
});

test('loadMediaBytesForUpload falls back to HTTP when local file is missing', async (t) => {
  const dir = makeTempDir();
  const prevStorage = process.env.MEDIA_STORAGE;
  const prevDir = process.env.LOCAL_MEDIA_DIR;
  process.env.MEDIA_STORAGE = 'local';
  process.env.LOCAL_MEDIA_DIR = dir;
  t.after(() => {
    if (prevStorage === undefined) delete process.env.MEDIA_STORAGE; else process.env.MEDIA_STORAGE = prevStorage;
    if (prevDir === undefined) delete process.env.LOCAL_MEDIA_DIR; else process.env.LOCAL_MEDIA_DIR = prevDir;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const key = 'whatsapp-media/template-headers/mann2/missing_file';
  const url = localUrlForKey(key);
  const bodyBytes = Buffer.from('remote-bytes');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (u) => {
    assert.equal(u, url);
    return {
      ok: true,
      headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'image/png' : null) },
      arrayBuffer: async () => bodyBytes.buffer.slice(bodyBytes.byteOffset, bodyBytes.byteOffset + bodyBytes.byteLength),
    };
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const loaded = await loadMediaBytesForUpload(url, 'image');
  assert.equal(loaded.fromStorage, false);
  assert.deepEqual(Buffer.from(loaded.buffer), bodyBytes);
  assert.equal(loaded.contentType, 'image/png');
});

test('loadMediaBytesForUpload throws the original 404 message for remote URLs', async (t) => {
  const prevStorage = process.env.MEDIA_STORAGE;
  process.env.MEDIA_STORAGE = 's3';
  t.after(() => {
    if (prevStorage === undefined) delete process.env.MEDIA_STORAGE; else process.env.MEDIA_STORAGE = prevStorage;
  });

  const url = 'https://example.com/expired-header.jpg';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404, headers: { get: () => null } });
  t.after(() => { globalThis.fetch = originalFetch; });

  await assert.rejects(
    () => loadMediaBytesForUpload(url, 'image'),
    /Media fetch failed \(HTTP 404\) — the header link may have expired/,
  );
});