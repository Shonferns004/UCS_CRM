import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import db from '../config/db.js';

// ---------------------------------------------------------------------------
// Stored-file proxy.
//
// Image columns hold full URLs, and they come from two very different places:
//
//   Supabase public storage  → https://<project>.supabase.co/storage/v1/object/public/...
//   S3 (app buckets)         → https://<bucket>.s3.<region>.amazonaws.com/<key>
//
// The Supabase ones load straight into an <img>. The S3 ones do not: those
// buckets are private, so a browser request comes back 403 and the cell shows a
// dead image. This service reads them with the app's own S3 credentials — the
// same ones db.storage.raw() hands the object API — so the viewer can show what
// is actually in the row without anyone opening a bucket to the internet.
// ---------------------------------------------------------------------------

// https://bucket.s3.ap-south-1.amazonaws.com/key
const VIRTUAL_HOST = /^https?:\/\/([^./]+)\.s3[.-]([a-z0-9-]+)\.amazonaws\.com\/(.+)$/i;
// https://s3.ap-south-1.amazonaws.com/bucket/key  and  https://s3-eu-west-1.amazonaws.com/bucket/key
const PATH_STYLE = /^https?:\/\/s3[.-]([a-z0-9-]+)\.amazonaws\.com\/([^/]+)\/(.+)$/i;

// Only image and document types a cell can sensibly preview. Anything else is
// left alone rather than streamed.
const TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif', svg: 'image/svg+xml',
  pdf: 'application/pdf',
};

const typeFor = (key) => {
  const m = /\.([a-z0-9]+)$/i.exec(String(key).split('?')[0]);
  return (m && TYPES[m[1].toLowerCase()]) || 'application/octet-stream';
};

// Meta downloads a WhatsApp template header itself, from outside this
// deployment, so it can only be handed an ordinary public HTTPS GET -- not a
// link served by this app (which sits behind Azure Front Door + Caddy) and not
// the raw bucket URL (private since the 2026-09-30 lockdown, so it answers 403
// and Meta reports 131053 "Media upload error"). A presigned URL keeps the
// bucket private while still being fetchable. Meta fetches asynchronously, so
// an hour is far longer than the observed gap while still making a leaked link
// short-lived.
const DEFAULT_PRESIGN_SECONDS = 60 * 60;
const MAX_PRESIGN_SECONDS = 6 * 60 * 60;

// The raw S3 handle for the account that can read a bucket. The registry holds
// one bucket per account, so an exact match wins; otherwise fall back to the
// first configured account, whose credentials may still reach a sibling bucket.
function accountHandleFor(bucket) {
  const accounts = db.storage.accounts().filter((a) => a.configured);
  const chosen = accounts.find((a) => a.bucket === bucket) || accounts[0];
  return chosen ? db.storage.raw(chosen.name) : null;
}

// The bucket and key a stored URL points at, or null when it is not S3 (a
// Supabase public URL, say) and therefore needs no proxy.
export function parseS3Url(url) {
  const v = String(url || '').trim();
  let m = VIRTUAL_HOST.exec(v);
  if (m) return { bucket: decodeURIComponent(m[1]), key: decodeURIComponent(m[3]) };
  m = PATH_STYLE.exec(v);
  if (m) return { bucket: decodeURIComponent(m[2]), key: decodeURIComponent(m[3]) };
  return null;
}

// Which account can read a given bucket. The registry holds one configured
// bucket per account, but a bucket URL can name any bucket that account can
// reach, so this is a preference order rather than a lookup: try the accounts
// whose own bucket matches first, then the rest.
function candidateAccounts(bucket) {
  const accounts = db.storage.accounts().filter((a) => a.configured);
  const exact = accounts.filter((a) => a.bucket === bucket);
  const rest = accounts.filter((a) => a.bucket !== bucket);
  return exact.concat(rest).map((a) => a.name);
}

// Open a stored object for streaming. Tries each configured account in turn and
// returns the first that can read it; null when none can (an S3 URL for a bucket
// this deployment has no keys for, or not an S3 URL at all).
export async function openStoredObject(url) {
  const ref = parseS3Url(url);
  if (!ref) return null;

  for (const account of candidateAccounts(ref.bucket)) {
    const handle = db.storage.raw(account);
    if (!handle) continue;
    try {
      const r = await handle.client.send(new GetObjectCommand({ Bucket: ref.bucket, Key: ref.key }));
      return {
        account,
        bucket: ref.bucket,
        key: ref.key,
        body: r.Body,
        contentType: r.ContentType || typeFor(ref.key),
        contentLength: r.ContentLength ?? null,
        lastModified: r.LastModified || null,
      };
    } catch (err) {
      // Wrong account for this bucket (AccessDenied/NoSuchBucket) — try the next.
    }
  }
  return null;
}

// Resolve one object by its full key without knowing which account holds it.
//
// Objects land in whichever bucket was active when they were written (a header
// cached months ago can sit in a bucket other than today's default), so a key on
// its own is not enough to build a working link. Probe each configured account
// and return both the raw stored URL (safe to persist in a media column, since
// the read path re-signs it) and a signed URL (for handing to Meta or the
// browser). Null when no account can read the key.
export async function resolveStoredKey(fullKey, { expiresIn } = {}) {
  const key = String(fullKey || '');
  if (!key) return null;

  const accounts = db.storage.accounts().filter((a) => a.configured);
  for (const account of accounts) {
    const handle = db.storage.raw(account.name);
    if (!handle) continue;
    try {
      await handle.client.send(new HeadObjectCommand({ Bucket: handle.bucket, Key: key }));
    } catch {
      // Wrong bucket for this account (NoSuchKey/NoSuchBucket/AccessDenied).
      continue;
    }

    const storedUrl = `https://${handle.bucket}.s3.${handle.region}.amazonaws.com/${key}`;
    let url = storedUrl;
    try {
      const wanted = Number(expiresIn);
      const secs = Math.min(Math.max(Number.isFinite(wanted) && wanted > 0 ? wanted : DEFAULT_PRESIGN_SECONDS, 60), MAX_PRESIGN_SECONDS);
      url = await getSignedUrl(
        handle.client,
        new GetObjectCommand({ Bucket: handle.bucket, Key: key }),
        { expiresIn: secs },
      );
    } catch (e) {
      console.warn(`[media-proxy] could not sign ${handle.bucket}/${key}: ${e?.message || e}`);
    }
    return { account: account.name, bucket: handle.bucket, key, storedUrl, url };
  }
  return null;
}

// A time-limited public URL for one stored object, for handing a link to
// something outside this deployment that fetches it itself (Meta, for a WhatsApp
// template header or an outbound media message). Returns the input unchanged when
// it is not an S3 object we can sign, so a caller can pass a Supabase URL or an
// already-signed URL straight through without a special case.
//
// `prefix` scopes what may be signed. It is not decoration: the URL often comes
// from a request body, and without it an agent could ask this to mint a link to
// any object in a bucket they share with other data (a donor receipt, say).
export async function presignStoredUrl(url, { expiresIn, prefix } = {}) {
  const original = String(url ?? '');
  const ref = parseS3Url(original);
  if (!ref) return original;
  if (prefix && !ref.key.startsWith(prefix)) return original;

  const handle = accountHandleFor(ref.bucket);
  if (!handle) return original;

  const wanted = Number(expiresIn);
  const secs = Math.min(Math.max(Number.isFinite(wanted) && wanted > 0 ? wanted : DEFAULT_PRESIGN_SECONDS, 60), MAX_PRESIGN_SECONDS);
  try {
    return await getSignedUrl(
      handle.client,
      new GetObjectCommand({ Bucket: ref.bucket, Key: ref.key }),
      { expiresIn: secs },
    );
  } catch (e) {
    console.warn(`[media-proxy] could not presign ${ref.bucket}/${ref.key}: ${e?.message || e}`);
    return original;
  }
}
