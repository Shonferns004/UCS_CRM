import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Exercises db.storage in local mode against a throwaway directory, so the
// driver can be verified without touching C:\UcsCrmMedia.
//
// Usage (from backend/):  node scripts/media/smoke-local-storage.mjs
// ---------------------------------------------------------------------------

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ucs-local-storage-'));
process.env.MEDIA_STORAGE = 'local';
process.env.LOCAL_MEDIA_DIR = root;
delete process.env.MEDIA_PUBLIC_BASE_URL;

const { default: db } = await import('../../src/config/db.js');

const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};

let exitCode = 0;
try {
  const handle = db.storage.from('whatsapp-media');

  const up = await handle.upload('smoke/hello.txt', Buffer.from('hello-local'));
  assert(!up.error, `upload failed: ${up.error?.message}`);

  const url = handle.getPublicUrl('smoke/hello.txt').data.publicUrl;
  // MEDIA_PUBLIC_BASE_URL may come from .env, so only the path is fixed.
  assert(url.endsWith('/api/media/whatsapp-media/smoke/hello.txt'), `unexpected url: ${url}`);

  const down = await handle.download('smoke/hello.txt');
  assert(!down.error && down.data.toString() === 'hello-local', 'download mismatch');

  const stream = await handle.readStream('smoke/hello.txt');
  assert(!stream.error && stream.data.contentLength === 11, 'readStream mismatch');
  stream.data.body.destroy();

  const presigned = await handle.presignDownload('smoke/hello.txt');
  assert(presigned.data.url === url, 'presign url mismatch');

  const missing = await handle.readStream('smoke/missing.txt');
  assert(missing.error, 'missing file should return an error');

  const removed = await handle.remove('smoke/hello.txt');
  assert(!removed.error, 'remove failed');
  assert(!fs.existsSync(path.join(root, 'whatsapp-media', 'smoke', 'hello.txt')), 'file still on disk');

  // createBucket / listBuckets behave like the S3 API in local mode.
  await db.storage.createBucket('receipts');
  const buckets = await db.storage.listBuckets();
  assert(buckets.data.some((b) => b.name === 'receipts'), 'receipts folder not listed');

  // Old S3 URLs must resolve to the same local file.
  const oldUrl =
    'https://ucs-crm-uploads-mumbai.s3.ap-south-1.amazonaws.com/worker-documents/selfies/s.jpg';
  await handle.upload('x.txt', Buffer.from('x'));
  await db.storage.from('worker-documents').upload('selfies/s.jpg', Buffer.from('selfie'));

  const { presignStoredUrl, openStoredObject, resolveStoredKey } =
    await import('../../src/services/mediaProxy.js');
  const mapped = await presignStoredUrl(oldUrl, { prefix: 'worker-documents/' });
  assert(mapped.endsWith('/api/media/worker-documents/selfies/s.jpg'), `map failed: ${mapped}`);

  const obj = await openStoredObject(oldUrl);
  assert(obj && obj.contentType === 'image/jpeg', 'openStoredObject failed');
  obj.body.destroy();

  const resolved = await resolveStoredKey('worker-documents/selfies/s.jpg');
  assert(resolved && resolved.url.endsWith('/api/media/worker-documents/selfies/s.jpg'), 'resolveStoredKey failed');

  const { presignSelfieUrl } = await import('../../src/services/signatureMediaLink.js');
  const selfie = await presignSelfieUrl(oldUrl);
  assert(selfie.endsWith('/api/media/worker-documents/selfies/s.jpg'), `selfie map failed: ${selfie}`);

  console.log('[smoke] local storage OK');
  console.log('[smoke] root:', root);
} catch (err) {
  exitCode = 1;
  console.error('[smoke] FAILED:', err && err.stack ? err.stack : err);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

process.exit(exitCode);
