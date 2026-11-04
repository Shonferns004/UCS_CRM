import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import db from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY;
const FSQ_KEY = process.env.FOURSQUARE_API_KEY;

const MAX_TEXT = 2000;

function text(value, max = MAX_TEXT) {
  if (value === undefined || value === null) return null;
  const s = String(value).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.slice(0, max);
}

function num(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function leadKey(item) {
  const name = text(item.name);
  if (!name) return null;
  const phone = text(item.phone) || '';
  const address = text(item.address) || '';
  return crypto
    .createHash('sha1')
    .update(`${name.toLowerCase()}|${(phone || address).toLowerCase()}`)
    .digest('hex');
}

function newBatchId() {
  return `bf-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

async function searchOSM(keyword, city, state) {
  const q = city || state ? `${keyword} in ${[city, state].filter(Boolean).join(' ')}` : keyword;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=50&addressdetails=1&extratags=1`;
  const resp = await fetch(url, { headers: { 'User-Agent': 'UCS-CRM/1.0 (admin@beingsevak.org)', 'Accept-Language': 'en' } });
  const body = await resp.text();
  let data = null;
  try { data = body ? JSON.parse(body) : null; } catch { return []; }
  if (!resp.ok || !Array.isArray(data)) return [];
  return data.map((p) => {
    const extra = p.extratags || {};
    return {
      id: String(p.place_id || ''),
      name: p.name || p.display_name?.split(',')[0] || '',
      address: p.display_name || '',
      phone: extra.phone || extra['contact:phone'] || extra['contact:mobile'] || '',
      website: extra.website || extra['contact:website'] || '',
      status: extra.opening_hours ? `Hours: ${extra.opening_hours}` : 'UNKNOWN',
      source: 'osm',
    };
  });
}

async function searchFoursquare(keyword, city, state) {
  if (!FSQ_KEY) return null;
  const near = [city, state].filter(Boolean).join(', ');
  const url = `https://api.foursquare.com/v3/places/search?query=${encodeURIComponent(keyword)}&near=${encodeURIComponent(near)}&limit=30&fields=fsq_id,name,tel,website,location,categories,hours`;
  const resp = await fetch(url, { headers: { Authorization: FSQ_KEY, Accept: 'application/json' } });
  const body = await resp.text();
  let data = null;
  try { data = body ? JSON.parse(body) : null; } catch { return []; }
  if (!resp.ok) return [];
  return (data?.results || []).map((p) => ({
    id: p.fsq_id || '',
    name: p.name || '',
    address: p.location?.formatted_address || p.location?.address || '',
    phone: p.tel || '',
    website: p.website || '',
    status: p.hours?.status || (p.hours?.open_now ? 'OPEN' : 'UNKNOWN'),
    source: 'foursquare',
  }));
}

async function searchGoogle(keyword, city, state) {
  if (!GOOGLE_KEY) return null;
  const textQuery = [keyword, city, state].filter(Boolean).join(', ');
  const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.businessStatus,places.rating,places.userRatingCount,nextPageToken',
    },
    body: JSON.stringify({ textQuery }),
  });
  const body = await resp.text();
  let data = null;
  try { data = body ? JSON.parse(body) : null; } catch { return []; }
  if (!resp.ok) return [];
  return (data?.places || []).map((p) => ({
    id: p.id || '',
    name: p.displayName?.text || '',
    address: p.formattedAddress || '',
    phone: p.nationalPhoneNumber || p.internationalPhoneNumber || '',
    website: p.websiteUri || '',
    status: p.businessStatus || 'UNKNOWN',
    rating: p.rating ?? null,
    reviews: p.userRatingCount ?? null,
    source: 'google',
  }));
}

export const collectBusinesses = async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) return res.status(400).json({ message: 'No items provided' });

  const keyword = text(req.body?.keyword);
  const location = text(req.body?.location);
  const source = text(req.body?.source) || 'google_maps_extension';
  const batchId = text(req.body?.batchId, 120) || newBatchId();
  const userId = req.user?.id || null;

  const client = await db._pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO business_finder_batches (id, keyword, location, source, user_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         keyword = COALESCE(EXCLUDED.keyword, business_finder_batches.keyword),
         location = COALESCE(EXCLUDED.location, business_finder_batches.location),
         source = COALESCE(EXCLUDED.source, business_finder_batches.source)`,
      [batchId, keyword, location, source, userId],
    );

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let position = 0;

    for (const raw of items) {
      const item = raw || {};
      const name = text(item.name);
      if (!name) { skipped++; continue; }

      const dedupeKey = leadKey({ ...item, name });
      const result = await client.query(
        `INSERT INTO business_finder_leads
           (name, category, phone, address, website, status, source, keyword, location,
            lat, lng, rating, reviews, place_url, plus_code, hours, email, dedupe_key, user_id, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())
         ON CONFLICT (dedupe_key) DO UPDATE SET
           name = EXCLUDED.name,
           category = COALESCE(EXCLUDED.category, business_finder_leads.category),
           phone = COALESCE(EXCLUDED.phone, business_finder_leads.phone),
           address = COALESCE(EXCLUDED.address, business_finder_leads.address),
           website = COALESCE(EXCLUDED.website, business_finder_leads.website),
           status = COALESCE(EXCLUDED.status, business_finder_leads.status),
           source = COALESCE(EXCLUDED.source, business_finder_leads.source),
           keyword = COALESCE(EXCLUDED.keyword, business_finder_leads.keyword),
           location = COALESCE(EXCLUDED.location, business_finder_leads.location),
           lat = COALESCE(EXCLUDED.lat, business_finder_leads.lat),
           lng = COALESCE(EXCLUDED.lng, business_finder_leads.lng),
           rating = COALESCE(EXCLUDED.rating, business_finder_leads.rating),
           reviews = COALESCE(EXCLUDED.reviews, business_finder_leads.reviews),
           place_url = COALESCE(EXCLUDED.place_url, business_finder_leads.place_url),
           plus_code = COALESCE(EXCLUDED.plus_code, business_finder_leads.plus_code),
           hours = COALESCE(EXCLUDED.hours, business_finder_leads.hours),
           email = COALESCE(EXCLUDED.email, business_finder_leads.email),
           user_id = COALESCE(EXCLUDED.user_id, business_finder_leads.user_id),
           updated_at = NOW()
         RETURNING id, (xmax = 0) AS inserted`,
        [
          name,
          text(item.category),
          text(item.phone, 60),
          text(item.address),
          text(item.website),
          text(item.status, 120),
          text(item.source, 80) || source,
          keyword,
          location,
          num(item.lat),
          num(item.lng),
          num(item.rating),
          num(item.reviews),
          text(item.placeUrl || item.place_url),
          text(item.plusCode || item.plus_code, 120),
          text(item.hours, 500),
          text(item.email, 200),
          dedupeKey,
          userId,
        ],
      );

      const row = result.rows[0];
      if (!row) { skipped++; continue; }
      if (row.inserted) inserted++; else updated++;

      await client.query(
        `INSERT INTO business_finder_batch_items (batch_id, lead_id, position)
         VALUES ($1, $2, $3)
         ON CONFLICT (batch_id, lead_id) DO NOTHING`,
        [batchId, row.id, position++],
      );
    }

    await client.query(
      `UPDATE business_finder_batches
          SET total = (SELECT COUNT(*) FROM business_finder_batch_items WHERE batch_id = $1)
        WHERE id = $1`,
      [batchId],
    );

    await client.query('COMMIT');
    return res.json({ saved: inserted + updated, inserted, updated, skipped, batchId });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('collectBusinesses error:', err);
    return res.status(500).json({ message: err.message || 'Internal error' });
  } finally {
    client.release();
  }
};

export const searchBusinesses = async (req, res) => {
  try {
    const keyword = (req.query.keyword || '').trim();
    const city = (req.query.city || '').trim();
    const state = (req.query.state || '').trim();
    const provider = (req.query.provider || 'auto').trim();
    if (!keyword) return res.status(400).json({ message: 'keyword is required' });

    let results = null;
    if (provider === 'google') results = await searchGoogle(keyword, city, state);
    else if (provider === 'foursquare') results = await searchFoursquare(keyword, city, state);
    else if (provider === 'osm') results = await searchOSM(keyword, city, state);
    else {
      if (GOOGLE_KEY) results = await searchGoogle(keyword, city, state);
      if (!results || results.length === 0) {
        const fsq = await searchFoursquare(keyword, city, state);
        if (fsq && fsq.length) results = fsq;
      }
      if (!results || results.length === 0) results = await searchOSM(keyword, city, state);
    }

    return res.json({
      results: results || [],
      provider: provider === 'auto' ? (GOOGLE_KEY ? 'google' : (FSQ_KEY ? 'foursquare' : 'osm')) : provider,
    });
  } catch (err) {
    console.error('searchBusinesses error:', err);
    return res.status(500).json({ message: err.message || 'Internal error' });
  }
};

function buildLeadFilter(query) {
  const clauses = [];
  const params = [];
  const add = (sql, value) => { params.push(value); clauses.push(sql.replace('$?', `$${params.length}`)); };

  const q = text(query.q, 200);
  const keyword = text(query.keyword, 200);
  const location = text(query.location, 200);
  const source = text(query.source, 80);
  const batchId = text(query.batchId || query.batch_id, 120);

  if (q) {
    params.push(`%${q}%`);
    const n = `$${params.length}`;
    clauses.push(`(l.name ILIKE ${n} OR l.phone ILIKE ${n} OR l.address ILIKE ${n} OR l.website ILIKE ${n} OR l.category ILIKE ${n} OR l.email ILIKE ${n})`);
  }
  if (keyword) add('l.keyword ILIKE $?', `%${keyword}%`);
  if (location) add('l.location ILIKE $?', `%${location}%`);
  if (source) add('l.source = $?', source);
  if (String(query.hasPhone) === 'true') clauses.push("l.phone IS NOT NULL AND l.phone <> ''");
  if (String(query.hasWebsite) === 'true') clauses.push("l.website IS NOT NULL AND l.website <> ''");
  if (String(query.hasEmail) === 'true') clauses.push("l.email IS NOT NULL AND l.email <> ''");
  if (batchId) add('EXISTS (SELECT 1 FROM business_finder_batch_items bi WHERE bi.lead_id = l.id AND bi.batch_id = $?)', batchId);

  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

export const listBusinesses = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 300, 1), 2000);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const { where, params } = buildLeadFilter(req.query);

    const summaryResult = await db._pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE l.phone IS NOT NULL AND l.phone <> '')::int AS with_phone,
              COUNT(*) FILTER (WHERE l.website IS NOT NULL AND l.website <> '')::int AS with_website,
              COUNT(*) FILTER (WHERE l.email IS NOT NULL AND l.email <> '')::int AS with_email
         FROM business_finder_leads l ${where}`,
      params,
    );

    const rowsResult = await db._pool.query(
      `SELECT l.*,
              (SELECT COUNT(*) FROM business_finder_batch_items bi WHERE bi.lead_id = l.id)::int AS batch_count
         FROM business_finder_leads l
         ${where}
         ORDER BY COALESCE(l.updated_at, l.created_at) DESC, l.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    return res.json({
      results: rowsResult.rows,
      summary: summaryResult.rows[0] || { total: 0, with_phone: 0, with_website: 0, with_email: 0 },
    });
  } catch (err) {
    console.error('listBusinesses error:', err);
    return res.status(500).json({ message: err.message || 'Internal error' });
  }
};

export const listBatches = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const result = await db._pool.query(
      `SELECT b.id AS batch_id,
              b.keyword,
              b.location,
              b.source,
              b.created_at,
              COUNT(bi.lead_id)::int AS total,
              COUNT(*) FILTER (WHERE l.phone IS NOT NULL AND l.phone <> '')::int AS with_phone,
              COUNT(*) FILTER (WHERE l.website IS NOT NULL AND l.website <> '')::int AS with_website
         FROM business_finder_batches b
         LEFT JOIN business_finder_batch_items bi ON bi.batch_id = b.id
         LEFT JOIN business_finder_leads l ON l.id = bi.lead_id
        GROUP BY b.id
        ORDER BY b.created_at DESC
        LIMIT $1`,
      [limit],
    );
    return res.json({ batches: result.rows });
  } catch (err) {
    console.error('listBatches error:', err);
    return res.status(500).json({ message: err.message || 'Internal error' });
  }
};

export const deleteBusiness = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });
    const result = await db._pool.query('DELETE FROM business_finder_leads WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });
    return res.json({ deleted: 1, id });
  } catch (err) {
    console.error('deleteBusiness error:', err);
    return res.status(500).json({ message: err.message || 'Internal error' });
  }
};

export const deleteBatch = async (req, res) => {
  try {
    const batchId = String(req.params.batchId || '').trim();
    if (!batchId) return res.status(400).json({ message: 'Invalid batch id' });
    const result = await db._pool.query('DELETE FROM business_finder_batches WHERE id = $1 RETURNING id', [batchId]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });
    return res.json({ deleted: 1, batchId });
  } catch (err) {
    console.error('deleteBatch error:', err);
    return res.status(500).json({ message: err.message || 'Internal error' });
  }
};

export const status = async (req, res) => {
  try {
    const result = await db._pool.query(
      `SELECT to_regclass('public.business_finder_leads') AS leads,
              to_regclass('public.business_finder_batches') AS batches`,
    );
    const row = result.rows[0] || {};
    return res.json({
      ok: Boolean(row.leads && row.batches),
      tables: { leads: Boolean(row.leads), batches: Boolean(row.batches) },
      providers: {
        google: Boolean(GOOGLE_KEY),
        foursquare: Boolean(FSQ_KEY),
        osm: true,
        extension: true,
      },
      user: { id: req.user?.id || null, role: req.user?.role || null },
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error('businessFinder status error:', err);
    return res.status(500).json({ ok: false, message: err.message || 'Internal error' });
  }
};

const EXTENSION_FILES = [
  'manifest.json',
  'background.js',
  'content.js',
  'popup.html',
  'popup.js',
  'options.html',
  'options.js',
  'config.js',
  'README.md',
];

async function findExtensionDir() {
  const candidates = [
    path.resolve(__dirname, '../../../extension'),
    path.resolve(process.cwd(), 'extension'),
    path.resolve(process.cwd(), '../extension'),
    path.resolve(process.cwd(), '../../extension'),
  ];
  for (const dir of candidates) {
    try {
      const stat = await fs.stat(path.join(dir, 'manifest.json'));
      if (stat.isFile()) return dir;
    } catch { /* try next */ }
  }
  return null;
}

function extensionReadme({ apiBase }) {
  return `UCS Business Collector (Chrome Extension)
========================================

This package is already configured for your account.

Install
-------
1. Open chrome://extensions in Chrome.
2. Turn on "Developer mode" (top right).
3. Click "Load unpacked" and select this unzipped folder.
4. Pin the extension so it is easy to open.

Use
---
1. Go to Accounts > Business Finder > Google Maps Search.
2. Enter a keyword and location, then click "Search on Google Maps".
3. The extension collects the visible results and saves them automatically.
4. Return to Business Finder > Collected Results to see the full data.

Settings
--------
API Base : ${apiBase}
The token is inside config.js. Do not share this folder with anyone.
If the token expires, download a fresh package from Business Finder.

Troubleshooting
---------------
- After installing or updating, reload the extension on chrome://extensions.
- Keep the Google Maps tab open until the blue collector badge says "Saved".
- If auto-save fails, open the extension popup and click "Save to CRM".
`;
}

export const downloadExtension = async (req, res) => {
  try {
    const dir = await findExtensionDir();
    if (!dir) {
      return res.status(404).json({ message: 'Extension folder not found on the server. Run the CRM from the project root.' });
    }

    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const proto = forwardedProto || req.protocol || 'http';
    const host = String(req.headers['x-forwarded-host'] || req.get('host') || 'localhost:5000').split(',')[0].trim();
    const apiBase = text(req.query.apiBase, 500) || `${proto}://${host}/api`;
    const crmOrigin = text(req.query.crmOrigin, 500) || `${proto}://${host}`;

    const zip = new JSZip();
    for (const file of EXTENSION_FILES) {
      if (file === 'config.js') continue;
      try {
        zip.file(file, await fs.readFile(path.join(dir, file)));
      } catch { /* file not present, skip */ }
    }

    zip.file(
      'config.js',
      `// Auto-generated by UCS CRM on ${new Date().toISOString()}.\n` +
      `// This file contains your CRM token. Do not share it.\n` +
      `globalThis.UCS_CONFIG = ${JSON.stringify({ apiBase, token, crmOrigin, autoSave: true }, null, 2)};\n`,
    );
    zip.file('INSTALL.txt', extensionReadme({ apiBase }));

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="ucs-business-collector.zip"');
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    console.error('downloadExtension error:', err);
    return res.status(500).json({ message: err.message || 'Internal error' });
  }
};
