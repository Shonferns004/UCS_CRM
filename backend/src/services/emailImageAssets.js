import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Embed builder-uploaded images into outgoing emails as CID attachments.
//
// Templates store images as public-ish URLs (for example
// http://localhost:5000/uploads/email-assets/x.png). Such a URL is useless to
// a recipient whose mail client cannot reach the CRM host, and Gmail often
// blocks remote images for unknown senders anyway. Reading the file from our
// own uploads volume and attaching it with a Content-ID makes the image render
// inline without any public hosting.
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EMAIL_ASSET_DIR = path.resolve(__dirname, '../../uploads/email-assets');
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

/** Extract the stored filename when the URL points at our email-assets route. */
export function resolveLocalEmailAsset(src) {
  const value = String(src || '').trim();
  if (!value) return null;
  let pathname = value;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    try {
      pathname = new URL(value).pathname;
    } catch {
      return null;
    }
  }
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const match = /^\/uploads\/email-assets\/([A-Za-z0-9._-]+)$/.exec(pathname);
  return match ? match[1] : null;
}

/**
 * Replace local email-asset image URLs with cid: references and return the
 * attachments nodemailer needs. External/missing images are left untouched.
 */
export async function buildInlineImageAttachments(html) {
  const source = String(html || '');
  if (!source) return { html: source, attachments: [] };

  const sources = new Set();
  for (const match of source.matchAll(/<img\b[^>]*\bsrc=(["'])([^"']+)\1/gi)) {
    sources.add(match[2]);
  }

  const cidBySrc = new Map();
  const attachments = [];
  let totalBytes = 0;
  let index = 0;

  for (const src of sources) {
    const fileName = resolveLocalEmailAsset(src);
    if (!fileName) continue;
    const ext = path.extname(fileName).slice(1).toLowerCase();
    const contentType = MIME_BY_EXT[ext];
    if (!contentType) continue;

    const fullPath = path.join(EMAIL_ASSET_DIR, fileName);
    try {
      const stat = await fs.promises.stat(fullPath);
      if (!stat.isFile() || stat.size === 0) continue;
      if (totalBytes + stat.size > MAX_TOTAL_BYTES) continue;
      const content = await fs.promises.readFile(fullPath);
      totalBytes += content.length;
      index += 1;
      const cid = `emailasset${index}.${crypto.randomBytes(6).toString('hex')}@ucs-crm`;
      cidBySrc.set(src, cid);
      attachments.push({
        filename: fileName,
        content,
        contentType,
        cid,
      });
    } catch {
      // File moved or unreadable: keep the original URL rather than breaking
      // the whole campaign for one image.
    }
  }

  if (!cidBySrc.size) return { html: source, attachments: [] };

  const rewritten = source.replace(/<img\b[^>]*>/gi, (tag) => {
    const match = /\bsrc=(["'])([^"']+)\1/i.exec(tag);
    if (!match) return tag;
    const cid = cidBySrc.get(match[2]);
    if (!cid) return tag;
    return tag.replace(/(\bsrc=)(["'])([^"']+)\2/i, (_all, prefix, quote) => `${prefix}${quote}cid:${cid}${quote}`);
  });

  return { html: rewritten, attachments };
}

export default buildInlineImageAttachments;
