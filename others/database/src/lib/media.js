import { apiBase, getAdminKey } from './api.js';

// ---------------------------------------------------------------------------
// Working out what a cell's value actually is, so the grid can show a picture
// instead of a 90-character URL.
//
// Two families of stored file live in this database:
//
//   Supabase public storage → loads directly in an <img>
//   private S3 buckets      → 403 for the browser, so it is fetched through
//                             /api/db/media with the admin key attached
//
// Nothing here guesses: a value is only treated as an image when the URL ends in
// an image extension or the row carries an image/* file_type next to it.
// ---------------------------------------------------------------------------

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|avif|svg)(\?|#|$)/i;
const DOC_EXT = /\.(pdf|pptx?|docx?|xlsx?|csv|zip|mp4|mov|webm)(\?|#|$)/i;

// Columns whose values are expected to point at a picture. Only used together
// with a matching extension, so `pan_number` and `signature` (initials text)
// stay text.
const IMAGE_COL = /(photo|image|img|picture|avatar|selfie|aadhaar|udid|scan|signature_url|thumb|banner|logo)/i;

const isUrl = (v) => typeof v === 'string' && /^(https?:)?\/\//i.test(v.trim());
const isPrivateS3 = (v) => /^https?:\/\/[^./]+\.s3[.-][a-z0-9-]+\.amazonaws\.com\//i.test(String(v).trim());

// mediaKind: 'image' | 'file' | null
export function mediaKind(value, columnName, row) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v || !isUrl(v)) return null;

  const siblingType = row && columnName ? String(row.file_type || row.mime_type || row.content_type || '') : '';
  const declaredImage = /^image\//i.test(siblingType);

  if (IMAGE_EXT.test(v)) return 'image';
  if (declaredImage) return 'image';
  // A column named like a picture whose URL has no extension still renders in
  // the CRM's own media endpoints.
  if (columnName && IMAGE_COL.test(columnName) && !DOC_EXT.test(v)) return 'image';
  if (DOC_EXT.test(v)) return 'file';
  return null;
}

// Blob cache. Private S3 previews need a fetch (to attach X-Admin-Key), and a
// table page can hold a few dozen of them — re-fetching on every scroll or
// re-sort would be wasteful. Oldest entries are revoked past the cap so a long
// browsing session cannot leak blob memory.
const MAX_CACHE = 60;
const cache = new Map();
const pending = new Map();

function remember(key, url) {
  cache.set(key, url);
  while (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value;
    const stale = cache.get(oldest);
    cache.delete(oldest);
    if (stale && stale.startsWith('blob:')) URL.revokeObjectURL(stale);
  }
  return url;
}

async function loadPrivate(key, value) {
  if (cache.has(key)) return { src: cache.get(key) };
  if (pending.has(key)) return pending.get(key);

  const url = `${apiBase}/api/db/media?url=${encodeURIComponent(value)}`;
  const job = fetch(url, { headers: { 'X-Admin-Key': getAdminKey() } })
    .then(async (res) => {
      if (res.ok) return { src: remember(key, URL.createObjectURL(await res.blob())) };
      // 401 is the backend asking for ENV_ADMIN_KEY — the cell says so instead
      // of showing a broken image with no explanation.
      if (res.status === 401) return { error: 'key' };
      return { error: 'missing', status: res.status };
    })
    .catch(() => ({ error: 'missing' }))
    .finally(() => pending.delete(key));

  pending.set(key, job);
  return job;
}

export function forgetCache() {
  for (const url of cache.values()) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
  cache.clear();
}

// What an image cell should render.
//   { src }            load this into the <img>
//   { error: 'key' }   private bucket, admin key not set/accepted yet
//   { error: 'missing' } not fetchable — expired URL, or a bucket this
//                       deployment has no keys for
// Public URLs resolve synchronously so a Supabase photo paints on first render.
export function resolveSrc(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  if (!isPrivateS3(v)) return { src: v };
  if (!apiBase) return { error: 'missing' };
  return loadPrivate(v, v);
}

// The full picture in a new tab. The blob URL is used when one is already
// cached, since a fresh tab cannot send the admin key header itself.
export function openExternally(value) {
  const v = String(value || '').trim();
  const cached = cache.get(v);
  if (cached) {
    window.open(cached, '_blank', 'noopener,noreferrer');
    return true;
  }
  if (!isPrivateS3(v)) {
    window.open(v, '_blank', 'noopener,noreferrer');
    return true;
  }
  resolveSrc(v);
  return false;
}
