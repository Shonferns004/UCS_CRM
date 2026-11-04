import db from '../config/db.js';
import { presignStoredUrl, resolveStoredKey } from './mediaProxy.js';

// WhatsApp only exposes a template header as a short-lived CDN sample URL
// (`components[].example.header_handle[0]`). Storing that URL in a chat row
// means the image is gone a few hours later, and sending it later fails.
// Copy the file into our own bucket once, then link to the stored object and
// re-sign it per read. The key scheme matches froWhatsAppService so the two
// surfaces share one cached copy per (project, template).
const MEDIA_BUCKET = 'whatsapp-media';
const MEDIA_KEY_PREFIX = 'whatsapp-media/';
const HEADER_DIR = 'template-headers';
const MEMO_TTL_MS = 50 * 60 * 1000;

const memo = new Map();

function safePart(value, fallback, { keepSeparators = false } = {}) {
  const text = String(value || '').trim() || fallback;
  return keepSeparators
    ? text.replace(/[^A-Za-z0-9_-]/g, '_')
    : text.replace(/[^A-Za-z0-9_-]/g, '');
}

export function templateHeaderStorageKey(project, templateName) {
  // Same key scheme as froWhatsAppService so both surfaces share one cached
  // copy per (project, template).
  return `${HEADER_DIR}/${safePart(project, 'unknown')}/${safePart(templateName, 'template', { keepSeparators: true })}`;
}

async function storedAsset(key) {
  const media = await resolveStoredKey(`${MEDIA_KEY_PREFIX}${key}`);
  if (!media) return null;
  return { storedUrl: media.storedUrl, signedUrl: media.url, key };
}

async function downloadAndStore(key, url, format, project, templateName) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) return null;

    const headerFormat = String(format || 'IMAGE').toUpperCase();
    const contentType = response.headers.get('content-type')
      || (headerFormat === 'VIDEO' ? 'video/mp4' : headerFormat === 'DOCUMENT' ? 'application/pdf' : 'image/jpeg');

    const { error } = await db.storage.from(MEDIA_BUCKET).upload(key, buffer, { contentType, upsert: true });
    if (error) {
      console.warn(`[template-header] upload ${key} failed: ${error.message || error}`);
      return null;
    }

    // Best effort, mirrors froWhatsAppService: a missing DB row only costs a
    // re-download because the object key is deterministic.
    await db
      .from('whatsapp_templates')
      .update({ header_storage_key: key, header_mime_type: contentType })
      .eq('name', templateName)
      .eq('project', project)
      .then(({ error: dbErr }) => {
        if (dbErr) console.warn(`[template-header] db update failed: ${dbErr.message}`);
      });

    return storedAsset(key);
  } catch (error) {
    console.warn(`[template-header] cache failed: ${error?.message || error}`);
    return null;
  }
}

/**
 * Resolve a durable header asset for a template.
 *
 * Returns `{ storedUrl, signedUrl }`:
 *   storedUrl — safe to persist (private S3 URL, never expires)
 *   signedUrl — fresh one-hour URL for a browser <img> or a Meta send
 */
export async function resolveTemplateHeaderAsset({ project, templateName, headerComponent, headerUrl }) {
  if (!templateName) return null;
  const key = templateHeaderStorageKey(project, templateName);

  const memoised = memo.get(key);
  if (memoised && (Date.now() - memoised.at) < MEMO_TTL_MS) return memoised.asset;

  let asset = await storedAsset(key);

  // A header already in our bucket (for example an upload made from the chat
  // composer) just needs a fresh signature.
  if (!asset) {
    const provided = String(headerUrl || '').trim();
    if (/^https?:\/\/[^/]*amazonaws\.com\//i.test(provided)) {
      asset = {
        storedUrl: provided,
        signedUrl: await presignStoredUrl(provided, { prefix: MEDIA_KEY_PREFIX }),
        key,
      };
    }
  }

  if (!asset) {
    const sample = headerComponent?.example?.header_handle?.[0]
      || headerComponent?.example?.header_handle
      || null;
    const sampleUrl = typeof sample === 'string' ? sample : null;
    // Opaque Meta upload handles ("4::...") cannot be fetched over HTTP; only
    // a real URL can be cached.
    if (sampleUrl && /^https?:\/\//i.test(sampleUrl)) {
      asset = await downloadAndStore(key, sampleUrl, headerComponent?.format, project, templateName);
    }
  }

  if (asset) memo.set(key, { at: Date.now(), asset });
  return asset;
}

export default resolveTemplateHeaderAsset;
