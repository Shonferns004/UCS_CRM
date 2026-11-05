import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  isSafeMediaKey,
  localPathForKey,
  contentTypeForKey,
  mediaRoot,
} from '../services/localMedia.js';

// ---------------------------------------------------------------------------
// Local media store (C:\UcsCrmMedia). Every upload made through db.storage in
// local mode lands here, and old S3 URLs map to the same relative path, so the
// existing bucket dump keeps serving without a data migration.
//
// Keys are validated twice: isSafeMediaKey rejects traversal at the key level,
// then realpath is checked against the media root so a symlink cannot escape it.
// ---------------------------------------------------------------------------
const router = Router();

// Some legacy objects (chat attachments in particular) were stored without an
// extension. S3 kept their Content-Type; a local file does not, so sniff the
// first bytes instead of forcing a download.
async function sniffContentType(file) {
  try {
    const handle = await fs.promises.open(file, 'r');
    try {
      const buf = Buffer.alloc(12);
      await handle.read(buf, 0, 12, 0);
      if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
      if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
      if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
      if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
          buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
      if (buf.slice(0, 4).toString('ascii') === '%PDF') return 'application/pdf';
    } finally {
      await handle.close();
    }
  } catch {
    /* fall through to octet-stream */
  }
  return 'application/octet-stream';
}

router.get('/*', async (req, res) => {
  const key = String(req.params[0] || '');
  if (!isSafeMediaKey(key)) {
    return res.status(400).json({ message: 'Invalid media path' });
  }

  let full;
  try {
    full = localPathForKey(key);
  } catch {
    return res.status(400).json({ message: 'Invalid media path' });
  }

  try {
    const [rootReal, real] = await Promise.all([
      fs.promises.realpath(mediaRoot()).catch(() => mediaRoot()),
      fs.promises.realpath(full).catch(() => null),
    ]);
    if (!real) return res.status(404).json({ message: 'Media not found' });
    if (!real.startsWith(`${rootReal}${path.sep}`) && real !== rootReal) {
      return res.status(403).json({ message: 'Media path not allowed' });
    }

    const st = await fs.promises.stat(real);
    if (!st.isFile()) return res.status(404).json({ message: 'Media not found' });

    let type = contentTypeForKey(key);
    if (type === 'application/octet-stream') type = await sniffContentType(real);
    res.setHeader('Content-Type', type);
    res.setHeader('Accept-Ranges', 'bytes');
    // Browser caching is safe (URLs are immutable once written), but these
    // files can be PII, so keep shared/proxy caches out of it.
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // SVG can carry script; neutralise it when rendered inline.
    if (type === 'image/svg+xml') {
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    }

    // Range support keeps audio/video seeking and PDF previews working.
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m) {
        let start = m[1] === '' ? 0 : Number(m[1]);
        let end = m[2] === '' ? st.size - 1 : Number(m[2]);
        if (m[1] === '' && m[2] !== '') {
          start = Math.max(0, st.size - Number(m[2]));
          end = st.size - 1;
        }
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= st.size) {
          res.status(416).setHeader('Content-Range', `bytes */${st.size}`);
          return res.end();
        }
        end = Math.min(end, st.size - 1);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${st.size}`);
        res.setHeader('Content-Length', String(end - start + 1));
        return fs.createReadStream(real, { start, end }).pipe(res);
      }
    }

    res.setHeader('Content-Length', String(st.size));
    res.setHeader('Last-Modified', st.mtime.toUTCString());
    return fs.createReadStream(real).pipe(res);
  } catch (err) {
    if (err && err.code === 'ENOENT') return res.status(404).json({ message: 'Media not found' });
    return res.status(500).json({ message: err.message || 'Could not read media' });
  }
});

export default router;
