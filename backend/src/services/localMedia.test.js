import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  isSafeMediaKey,
  localPathForKey,
  localUrlForKey,
  urlToMediaKey,
  contentTypeForKey,
  writeObject,
  readObject,
  statObject,
  removeObject,
  listMediaDirs,
} from './localMedia.js';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ucs-media-test-'));
process.env.LOCAL_MEDIA_DIR = tmpRoot;
process.env.MEDIA_STORAGE = 'local';
delete process.env.MEDIA_PUBLIC_BASE_URL;

test.after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test('rejects keys that escape the media root', () => {
  for (const key of ['../secret.txt', 'a/../../b.txt', '/etc/passwd', 'C:\\Windows\\win.ini', 'a\\b.txt', '', 'a//b']) {
    assert.equal(isSafeMediaKey(key), false, `expected unsafe: ${key}`);
  }
  for (const key of ['receipts/a.pdf', 'worker-documents/selfies/x.jpg', 'a.b/c-d_e.png']) {
    assert.equal(isSafeMediaKey(key), true, `expected safe: ${key}`);
  }
  assert.throws(() => localPathForKey('../x'), /Unsafe media key/);
});

test('maps old S3, local and bare values to the same key', () => {
  const key = 'worker-documents/selfies/a.jpg';
  assert.equal(
    urlToMediaKey('https://ucs-crm-uploads-mumbai.s3.ap-south-1.amazonaws.com/worker-documents/selfies/a.jpg'),
    key,
  );
  assert.equal(urlToMediaKey('https://s3.ap-south-1.amazonaws.com/ucs-crm-uploads-mumbai/worker-documents/selfies/a.jpg'), 'ucs-crm-uploads-mumbai/worker-documents/selfies/a.jpg');
  assert.equal(urlToMediaKey('/api/media/worker-documents/selfies/a.jpg'), key);
  assert.equal(urlToMediaKey('http://192.168.1.100:5000/api/media/worker-documents/selfies/a.jpg?x=1'), key);
  assert.equal(urlToMediaKey(key), key);
  assert.equal(urlToMediaKey('https://abc.supabase.co/storage/v1/object/public/x.png'), null);
});

test('builds an encoded local URL and guesses content types', () => {
  assert.equal(localUrlForKey('receipts/a b.pdf'), '/api/media/receipts/a%20b.pdf');
  assert.equal(contentTypeForKey('a.JPG'), 'image/jpeg');
  assert.equal(contentTypeForKey('a.pdf'), 'application/pdf');
  assert.equal(contentTypeForKey('a.unknown'), 'application/octet-stream');
});

test('writes, reads and removes an object', async () => {
  const key = 'receipts/receipt-1.pdf';
  await writeObject(key, Buffer.from('hello'));

  const st = await statObject(key);
  assert.ok(st);
  assert.equal(st.size, 5);
  assert.deepEqual(await readObject(key), Buffer.from('hello'));

  assert.equal(await removeObject(key), true);
  assert.equal(await statObject(key), null);
});

test('overwrite replaces the previous file', async () => {
  const key = 'whatsapp-media/replace.txt';
  await writeObject(key, Buffer.from('old'));
  await writeObject(key, Buffer.from('new-content'));
  assert.equal((await readObject(key)).toString(), 'new-content');
});

test('lists top-level media folders', async () => {
  await writeObject('receipts/x.pdf', Buffer.from('x'));
  await writeObject('certificates/y.pdf', Buffer.from('y'));
  const dirs = await listMediaDirs();
  assert.ok(dirs.includes('receipts'));
  assert.ok(dirs.includes('certificates'));
});
