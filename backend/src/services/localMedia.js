import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Local media storage.
//
// AWS S3 is no longer the media backend: the existing bucket dump at
// C:\UcsCrmMedia is the live store. Keys keep the exact S3 layout
// (<prefix>/<file>), so every database row that still holds an S3 URL resolves
// to the same relative path with no data migration.
//
// Everything here is deliberately path-safe: a key comes from a database
// column or a request URL, and neither is allowed to escape MEDIA_ROOT.
// ---------------------------------------------------------------------------

const DEFAULT_MEDIA_ROOT = 'C:\\UcsCrmMedia';

/** True unless the deployment explicitly opts back into S3. */
export function isLocalStorage() {
  return String(process.env.MEDIA_STORAGE || 'local').trim().toLowerCase() !== 's3';
}

/** Absolute media root. Overridable with LOCAL_MEDIA_DIR. */
export function mediaRoot() {
  return path.resolve(process.env.LOCAL_MEDIA_DIR || DEFAULT_MEDIA_ROOT);
}

// Keys are POSIX-style relative paths ("receipts/abc.pdf"). Backslashes are
// rejected rather than normalised so a Windows path can never be mistaken for
// a key, and dot segments are rejected segment-wise (the character check alone
// would still let "a/../../b" through).
export function isSafeMediaKey(key) {
  if (typeof key !== 'string') return false;
  const value = key.trim();
  if (!value || value.length > 1024) return false;
  if (value.includes('\0') || value.includes('\\')) return false;
  if (value.startsWith('/')) return false;
  if (/^[A-Za-z]:/.test(value)) return false;
  return value.split('/').every((seg) => seg.length > 0 && seg !== '.' && seg !== '..');
}

/** Absolute on-disk path for a media key, or throws for an unsafe key. */
export function localPathForKey(key) {
  if (!isSafeMediaKey(key)) {
    const err = new Error('Unsafe media key');
    err.code = 'UNSAFE_MEDIA_KEY';
    throw err;
  }
  const root = mediaRoot();
  const full = path.resolve(root, key.trim());
  const rel = path.relative(root, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    const err = new Error('Media key escapes the media root');
    err.code = 'UNSAFE_MEDIA_KEY';
    throw err;
  }
  return full;
}

/**
 * Public URL for a key. MEDIA_PUBLIC_BASE_URL is optional: an empty value
 * yields a same-origin path, which is what the CRM frontend uses. Outbound
 * consumers (WhatsApp/Meta) need an absolute, internet-reachable base.
 */
export function localUrlForKey(key) {
  const base = String(process.env.MEDIA_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  const encoded = String(key || '')
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => encodeURIComponent(s))
    .join('/');
  return `${base}/api/media/${encoded}`;
}

/**
 * Extract a media key from any stored shape:
 *   - old S3 URL: https://<bucket>.s3.<region>.amazonaws.com/<key>
 *   - new local URL: http://host/api/media/<key> or /api/media/<key>
 *   - bare key: worker-documents/selfies/x.jpg
 * Returns null for values that are not ours (e.g. a Supabase URL).
 */
export function urlToMediaKey(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw);
  const protocolRelative = raw.startsWith('//');
  const rootPath = raw.startsWith('/');

  if (!hasScheme && !protocolRelative && !rootPath) {
    return isSafeMediaKey(raw) ? raw : null;
  }

  let url;
  try {
    url = new URL(raw, 'http://local.invalid');
  } catch {
    return null;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    pathname = url.pathname;
  }

  const marker = '/api/media/';
  const at = pathname.indexOf(marker);
  if (at !== -1) {
    const key = pathname.slice(at + marker.length);
    return isSafeMediaKey(key) ? key : null;
  }

  const host = url.hostname.toLowerCase();
  if (host.endsWith('amazonaws.com') || host.endsWith('amazonaws.com.cn')) {
    const key = pathname.replace(/^\/+/, '');
    return isSafeMediaKey(key) ? key : null;
  }

  return null;
}

const CONTENT_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif', svg: 'image/svg+xml',
  ico: 'image/x-icon', tif: 'image/tiff', tiff: 'image/tiff',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8',
  json: 'application/json', xml: 'application/xml',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav', aac: 'audio/aac',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska',
  zip: 'application/zip', gz: 'application/gzip', tar: 'application/x-tar',
  heic: 'image/heic', heif: 'image/heif',
};

export function contentTypeForKey(key) {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(key || '').split('?')[0]);
  return (m && CONTENT_TYPES[m[1].toLowerCase()]) || 'application/octet-stream';
}

/** Stat a key; returns null when the file is absent. */
export async function statObject(key) {
  try {
    const st = await fsp.stat(localPathForKey(key));
    return st.isFile() ? st : null;
  } catch {
    return null;
  }
}

/** Read a key into a Buffer; throws ENOENT when absent. */
export async function readObject(key) {
  return fsp.readFile(localPathForKey(key));
}

/** Write a key atomically (temp file + rename, so a crash cannot truncate). */
export async function writeObject(key, buffer) {
  const dest = localPathForKey(key);
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, buffer);
  try {
    await fsp.rename(tmp, dest);
  } catch (err) {
    // Windows can refuse to replace an existing file; remove and retry once.
    await fsp.rm(dest, { force: true });
    await fsp.rename(tmp, dest);
  }
}

/** Delete a key; returns false when it did not exist. */
export async function removeObject(key) {
  try {
    await fsp.rm(localPathForKey(key), { force: true });
    return true;
  } catch {
    return false;
  }
}

/** Create a directory below the media root (used for the S3 "bucket" API). */
export async function ensureMediaDir(name) {
  const dir = localPathForKey(String(name));
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

/** Top-level media folders, i.e. the local equivalent of listBuckets(). */
export async function listMediaDirs() {
  const root = mediaRoot();
  await fsp.mkdir(root, { recursive: true });
  const entries = await fsp.readdir(root, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

/** Open a key as a readable stream plus the headers a response needs. */
export async function openObject(key) {
  const st = await statObject(key);
  if (!st) return null;
  return {
    body: fs.createReadStream(localPathForKey(key)),
    contentType: contentTypeForKey(key),
    contentLength: st.size,
    lastModified: st.mtime,
  };
}
