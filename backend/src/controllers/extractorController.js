import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import db from '../config/db.js';
import { normalizePhone, DEFAULT_COUNTRY } from '../extractor/phone.js';
import { buildRowHash } from '../extractor/hash.js';
import { matchCategory } from '../extractor/taxonomy.js';
import { isAiConfigured, aiModelName } from '../extractor/gemini.js';
import { kickExtractorAiWorkerNow } from '../extractor/aiWorker.js';
import {
  EXPORT_COLUMNS,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
} from '../extractor/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_TEXT = 1000;
const MAX_ROWS_PER_BATCH = 200;
const MAX_EXPORT_ROWS = 50000;
const WORKSPACE = 'default';

function text(value, max = MAX_TEXT) {
  if (value === undefined || value === null) return null;
  const s = String(value).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.slice(0, max);
}

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

// ---------------------------------------------------------------------------
// Row/response mapping
// ---------------------------------------------------------------------------

function mapLead(row) {
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    category: row.category,
    categoryLabel: row.category_label,
    address: row.address,
    phoneE164: row.phone_e164,
    phoneRaw: row.phone_raw,
    phoneLineType: row.phone_line_type,
    phoneRegionState: row.phone_region_state,
    phoneRegionCity: row.phone_region_city,
    phoneRegionSource: row.phone_region_source,
    website: row.website,
    email: row.email,
    cin: row.cin,
    verificationStatus: row.verification_status,
    leadStatus: row.lead_status,
    leadStatusLabel: LEAD_STATUS_LABELS[row.lead_status] || row.lead_status,
    ownerName: row.owner_name,
    tags: row.tags || [],
    aiTags: row.ai_tags || [],
    aiScore: row.ai_score,
    aiReason: row.ai_reason,
    aiStatus: row.ai_status,
    aiModel: row.ai_model,
    aiProcessedAt: row.ai_processed_at,
    emailStatus: row.email_status,
    emailCheckedAt: row.email_checked_at,
    sourceNames: row.source_names || [],
    sourceUrl: row.source_url,
    firstBatchId: row.first_batch_id,
    lastBatchId: row.last_batch_id,
    capturedAt: row.captured_at,
    lastFetchedAt: row.last_fetched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBatch(row) {
  if (!row) return null;
  return {
    batchId: row.batch_id,
    sessionId: row.session_id,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    capturedAt: row.captured_at,
    rowCount: Number(row.row_count) || 0,
    accepted: Number(row.accepted) || 0,
    updated: Number(row.updated) || 0,
    duplicates: Number(row.duplicates) || 0,
    rejected: Number(row.rejected) || 0,
    leadCount: row.lead_count === undefined ? undefined : Number(row.lead_count) || 0,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Filters shared by the list and the export, so both always select the same rows
// ---------------------------------------------------------------------------

const SORT_COLUMNS = {
  createdAt: 'l.created_at',
  updatedAt: 'l.updated_at',
  capturedAt: 'l.captured_at',
  displayName: 'l.display_name',
  aiScore: 'l.ai_score',
};

/**
 * Turn a date filter into a timestamp. A bare `YYYY-MM-DD` means the whole
 * local day: start at 00:00 for "from", end at 23:59:59.999 for "to". Anything
 * with a time is parsed as-is.
 */
function parseDateBoundary(value, endOfDay) {
  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    if (endOfDay) date.setHours(23, 59, 59, 999);
    return date.toISOString();
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildLeadWhere(query = {}) {
  const clauses = [];
  const params = [];

  const q = text(query.q, 200);
  if (q) {
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    clauses.push(`(
      l.display_name ILIKE ${p}
      OR l.phone_e164 ILIKE ${p}
      OR l.phone_raw ILIKE ${p}
      OR l.address ILIKE ${p}
      OR l.website ILIKE ${p}
      OR l.email ILIKE ${p}
    )`);
  }

  const category = text(query.category, 100);
  if (category) {
    params.push(category);
    clauses.push(`l.category = $${params.length}`);
  }

  const status = text(query.status, 40);
  if (status && LEAD_STATUSES.includes(status)) {
    params.push(status);
    clauses.push(`l.lead_status = $${params.length}`);
  }

  const verification = text(query.verificationStatus, 40);
  if (verification) {
    params.push(verification);
    clauses.push(`l.verification_status = $${params.length}`);
  }

  const batchId = text(query.batchId, 120);
  if (batchId) {
    params.push(batchId);
    clauses.push(`EXISTS (
      SELECT 1 FROM extractor_capture_batch_items bi
       WHERE bi.row_hash = l.row_hash AND bi.batch_id = $${params.length}
    )`);
  }

  const hasPhone = String(query.hasPhone ?? '').toLowerCase();
  if (hasPhone === 'true') clauses.push('l.phone_e164 IS NOT NULL');
  if (hasPhone === 'false') clauses.push('l.phone_e164 IS NULL');

  const hasWebsite = String(query.hasWebsite ?? '').toLowerCase();
  if (hasWebsite === 'true') clauses.push('l.website IS NOT NULL');
  if (hasWebsite === 'false') clauses.push('l.website IS NULL');

  const hasEmail = String(query.hasEmail ?? '').toLowerCase();
  if (hasEmail === 'true') clauses.push('l.email IS NOT NULL');
  if (hasEmail === 'false') clauses.push('l.email IS NULL');

  const capturedFrom = text(query.capturedFrom, 40);
  if (capturedFrom) {
    const from = parseDateBoundary(capturedFrom, false);
    if (from) {
      params.push(from);
      clauses.push(`l.captured_at >= $${params.length}`);
    }
  }

  const capturedTo = text(query.capturedTo, 40);
  if (capturedTo) {
    // A date-only "To" must include the whole day, otherwise picking today
    // compares against 00:00 and hides everything captured later that day.
    const to = parseDateBoundary(capturedTo, true);
    if (to) {
      params.push(to);
      clauses.push(`l.captured_at <= $${params.length}`);
    }
  }

  const aiTag = text(query.aiTag, 80);
  if (aiTag) {
    params.push(aiTag);
    clauses.push(`$${params.length} = ANY(l.ai_tags)`);
  }

  const minScoreRaw = String(query.minScore ?? '').trim();
  if (minScoreRaw !== '') {
    const minScore = Number(minScoreRaw);
    if (Number.isFinite(minScore)) {
      params.push(Math.max(0, Math.min(100, Math.trunc(minScore))));
      // NULL scores (pending/error rows) are not ">= 0"; a score filter must
      // only match rows that actually have a verdict.
      clauses.push(`l.ai_score IS NOT NULL AND l.ai_score >= $${params.length}`);
    }
  }

  const aiStatus = text(query.aiStatus, 20);
  if (aiStatus && ['pending', 'running', 'done', 'error'].includes(aiStatus)) {
    params.push(aiStatus);
    clauses.push(`l.ai_status = $${params.length}`);
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

// ---------------------------------------------------------------------------
// Capture ingest
// ---------------------------------------------------------------------------

function validateBatch(body) {
  const errors = [];
  const batchId = text(body?.batchId, 64);
  const sessionId = text(body?.sessionId, 64);
  const sourceUrl = text(body?.sourceUrl, 2000);
  const sourceName = text(body?.sourceName, 200);
  const capturedAt = text(body?.capturedAt, 40);

  if (!batchId) errors.push('batchId is required');
  if (!sessionId) errors.push('sessionId is required');
  if (!sourceUrl) errors.push('sourceUrl is required');
  else {
    try {
      const parsed = new URL(sourceUrl);
      if (!/^https?:$/.test(parsed.protocol)) errors.push('sourceUrl must be http(s)');
    } catch {
      errors.push('sourceUrl is not a valid URL');
    }
  }
  if (!sourceName) errors.push('sourceName is required');
  if (!capturedAt || Number.isNaN(Date.parse(capturedAt))) errors.push('capturedAt must be an ISO timestamp');

  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (rows.length === 0) errors.push('rows must contain at least one row');
  if (rows.length > MAX_ROWS_PER_BATCH) errors.push(`rows cannot exceed ${MAX_ROWS_PER_BATCH}`);

  return {
    errors,
    batch: {
      batchId,
      sessionId,
      sourceUrl,
      sourceName,
      capturedAt: capturedAt && !Number.isNaN(Date.parse(capturedAt)) ? new Date(capturedAt).toISOString() : null,
      country: (text(body?.country, 2) || DEFAULT_COUNTRY).toUpperCase(),
      rows,
    },
  };
}

export const collectCaptures = async (req, res) => {
  const { errors, batch } = validateBatch(req.body || {});
  if (errors.length) {
    return res.status(400).json({ message: 'The capture batch is not valid.', errors });
  }

  const result = {
    accepted: 0,
    updated: 0,
    duplicatesIgnored: 0,
    rejected: 0,
    rejections: [],
    batchId: batch.batchId,
  };

  /** @type {Array<{lead: object, rowHash: string, rowIndex: number}>} */
  const inputs = [];

  batch.rows.forEach((rawRow, index) => {
    if (!rawRow || typeof rawRow !== 'object') {
      result.rejected += 1;
      result.rejections.push({ row: index, reason: 'Row is not an object.' });
      return;
    }

    const name = text(rawRow.name, 400);
    if (!name) {
      result.rejected += 1;
      result.rejections.push({ row: index, reason: 'Missing business name.' });
      return;
    }

    const phoneRaw = text(rawRow.phone, 60);
    const city = text(rawRow.city, 200);
    const state = text(rawRow.state, 200);

    const phone = normalizePhone(phoneRaw, {
      defaultCountry: batch.country,
      addressHint: { state, city },
    });

    // This workspace runs on mobile numbers (WhatsApp outreach), so a listing
    // without a mobile number is reported back instead of stored.
    if (phone.lineType !== 'mobile') {
      result.rejected += 1;
      result.rejections.push({
        row: index,
        reason: !phoneRaw
          ? 'No phone number on this listing.'
          : phone.e164
            ? `Not a mobile number (${phone.lineType}).`
            : 'Phone number could not be read.',
      });
      return;
    }

    const verificationStatus = phone.formatValid ? 'format_valid' : 'needs_review';
    const categoryLabel = text(rawRow.categoryLabel, 200);
    const matched = matchCategory(categoryLabel);

    const lead = {
      workspaceId: WORKSPACE,
      entityType: 'local_business',
      displayName: name,
      category: matched?.id ?? null,
      categoryLabel,
      address: text(rawRow.address, MAX_TEXT),
      phoneE164: phone.e164,
      phoneRaw,
      phoneRegionState: phone.region.state,
      phoneRegionCity: phone.region.city,
      phoneRegionSource: phone.region.source,
      phoneLineType: phone.lineType,
      website: text(rawRow.website, 500),
      email: text(rawRow.email, 320),
      sourceNames: [batch.sourceName],
      sourceUrl: batch.sourceUrl,
      capturedAt: batch.capturedAt,
      verificationStatus,
      leadStatus: 'new',
      lastFetchedAt: batch.capturedAt,
    };

    inputs.push({
      lead,
      rowHash: buildRowHash({
        sourceUrl: batch.sourceUrl,
        name,
        e164: phone.e164,
        website: lead.website,
        address: lead.address,
      }),
      rowIndex: index,
    });
  });

  const client = await db._pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO extractor_capture_batches
         (batch_id, session_id, workspace_id, source_name, source_url, captured_at, row_count, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (batch_id, workspace_id) DO UPDATE SET
         source_name = EXCLUDED.source_name,
         source_url = EXCLUDED.source_url,
         captured_at = EXCLUDED.captured_at,
         row_count = GREATEST(extractor_capture_batches.row_count, EXCLUDED.row_count)`,
      [
        batch.batchId,
        batch.sessionId,
        WORKSPACE,
        batch.sourceName,
        batch.sourceUrl,
        batch.capturedAt,
        batch.rows.length,
        req.user?.id ? String(req.user.id) : null,
      ],
    );

    // The previous batch for each row decides whether a repeat is a duplicate
    // (same batch re-posted) or an update (a later batch re-captured the row).
    // Reading it before the upsert is required: RETURNING already reflects the
    // new `last_batch_id`, so comparing there would report every repeat as a
    // duplicate.
    const hashes = inputs.map((input) => input.rowHash);
    const existingRows = hashes.length
      ? await client.query(
          `SELECT row_hash, last_batch_id
             FROM extractor_leads
            WHERE row_hash = ANY($1::text[])`,
          [hashes],
        )
      : { rows: [] };
    const previousBatch = new Map(
      existingRows.rows.map((row) => [row.row_hash, row.last_batch_id]),
    );

    for (const input of inputs) {
      const lead = input.lead;
      const upsert = await client.query(
        `INSERT INTO extractor_leads (
           workspace_id, entity_type, display_name, category, category_label, address,
           phone_e164, phone_raw, phone_region_state, phone_region_city,
           phone_region_source, phone_line_type, website, email,
           source_names, source_url, captured_at, verification_status,
           lead_status, last_fetched_at, row_hash, first_batch_id, last_batch_id
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
           $18,$19,$20,$21,$22,$23
         )
         ON CONFLICT (row_hash) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           category = COALESCE(EXCLUDED.category, extractor_leads.category),
           category_label = COALESCE(EXCLUDED.category_label, extractor_leads.category_label),
           address = COALESCE(EXCLUDED.address, extractor_leads.address),
           phone_e164 = COALESCE(EXCLUDED.phone_e164, extractor_leads.phone_e164),
           phone_raw = COALESCE(EXCLUDED.phone_raw, extractor_leads.phone_raw),
           phone_region_state = COALESCE(EXCLUDED.phone_region_state, extractor_leads.phone_region_state),
           phone_region_city = COALESCE(EXCLUDED.phone_region_city, extractor_leads.phone_region_city),
           phone_region_source = COALESCE(EXCLUDED.phone_region_source, extractor_leads.phone_region_source),
           phone_line_type = COALESCE(EXCLUDED.phone_line_type, extractor_leads.phone_line_type),
           website = COALESCE(EXCLUDED.website, extractor_leads.website),
           email = COALESCE(EXCLUDED.email, extractor_leads.email),
           source_names = (
             SELECT array_agg(DISTINCT name)
             FROM unnest(
               COALESCE(extractor_leads.source_names, '{}') || COALESCE(EXCLUDED.source_names, '{}')
             ) AS name
           ),
           source_url = EXCLUDED.source_url,
           last_fetched_at = EXCLUDED.last_fetched_at,
           last_batch_id = EXCLUDED.last_batch_id,
           updated_at = NOW()
         RETURNING (xmax = 0) AS inserted, last_batch_id`,
        [
          lead.workspaceId,
          lead.entityType,
          lead.displayName,
          lead.category,
          lead.categoryLabel,
          lead.address,
          lead.phoneE164,
          lead.phoneRaw,
          lead.phoneRegionState,
          lead.phoneRegionCity,
          lead.phoneRegionSource,
          lead.phoneLineType,
          lead.website,
          lead.email,
          lead.sourceNames,
          lead.sourceUrl,
          lead.capturedAt,
          lead.verificationStatus,
          lead.leadStatus,
          lead.lastFetchedAt,
          input.rowHash,
          batch.batchId,
          batch.batchId,
        ],
      );

      const returned = upsert.rows[0];
      if (!returned) continue;
      if (returned.inserted) result.accepted += 1;
      else if (previousBatch.get(input.rowHash) === batch.batchId) result.duplicatesIgnored += 1;
      else result.updated += 1;
    }

    if (inputs.length) {
      const values = [];
      const placeholders = [];
      let i = 1;
      for (const input of inputs) {
        placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++})`);
        values.push(batch.batchId, input.rowHash, WORKSPACE, input.rowIndex);
      }
      await client.query(
        `INSERT INTO extractor_capture_batch_items (batch_id, row_hash, workspace_id, row_index)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (batch_id, row_hash) DO UPDATE SET row_index = EXCLUDED.row_index`,
        values,
      );
    }

    await client.query(
      `UPDATE extractor_capture_batches
          SET accepted = $1, updated = $2, duplicates = $3, rejected = $4
        WHERE batch_id = $5 AND workspace_id = $6`,
      [
        result.accepted,
        result.updated,
        result.duplicatesIgnored,
        result.rejected,
        batch.batchId,
        WORKSPACE,
      ],
    );

    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection already dead */ }
    throw err;
  } finally {
    client.release();
  }

  // Tagging runs in the background so a slow model never delays a capture.
  if (result.accepted > 0 || result.updated > 0) kickExtractorAiWorkerNow();

  return res.json(result);
};

// ---------------------------------------------------------------------------
// AI tagging settings + vocabulary
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AI_KEYWORD_MAX = 15;
const AI_KEYWORD_LEN = { min: 2, max: 80 };

async function aiCounts() {
  const result = await db._pool.query(
    `SELECT ai_status, COUNT(*)::int AS n
       FROM extractor_leads
      WHERE workspace_id = $1
      GROUP BY ai_status`,
    [WORKSPACE],
  );
  const counts = { pending: 0, running: 0, done: 0, error: 0, total: 0 };
  for (const row of result.rows) {
    if (row.ai_status in counts) counts[row.ai_status] = row.n;
    counts.total += row.n;
  }
  return counts;
}

async function listAiKeywords() {
  const result = await db._pool.query(
    `SELECT id, keyword, created_at
       FROM extractor_ai_keywords
      WHERE workspace_id = $1
      ORDER BY created_at, keyword`,
    [WORKSPACE],
  );
  return result.rows.map((row) => ({
    id: row.id,
    keyword: row.keyword,
    createdAt: row.created_at,
  }));
}

function normaliseKeyword(value) {
  const keyword = text(value, AI_KEYWORD_LEN.max);
  if (!keyword || keyword.length < AI_KEYWORD_LEN.min) return null;
  return keyword;
}

export const getAiSettings = async (req, res) => {
  const [keywords, counts, last, used] = await Promise.all([
    listAiKeywords(),
    aiCounts(),
    db._pool.query(
      `SELECT MAX(ai_processed_at) AS last_processed_at FROM extractor_leads`,
    ),
    db._pool.query(
      `SELECT tag, COUNT(*)::int AS n
         FROM extractor_leads l, unnest(l.ai_tags) AS tag
        WHERE l.workspace_id = $1
        GROUP BY tag
        ORDER BY n DESC, tag`,
      [WORKSPACE],
    ),
  ]);

  return res.json({
    configured: isAiConfigured(),
    model: aiModelName(),
    maxKeywords: AI_KEYWORD_MAX,
    keywords,
    // Tags that exist on imported rows but are not in the current vocabulary.
    // Without this the AI filter cannot reach rows tagged before this CRM was
    // in use (or tagged with a keyword that has since been removed).
    usedTags: used.rows.map((row) => ({ tag: row.tag, count: row.n })),
    counts,
    lastProcessedAt: last.rows[0]?.last_processed_at || null,
  });
};

export const addAiKeyword = async (req, res) => {
  const keyword = normaliseKeyword(req.body?.keyword);
  if (!keyword) {
    return res.status(400).json({ message: `A keyword must be ${AI_KEYWORD_LEN.min}-${AI_KEYWORD_LEN.max} characters.` });
  }

  const current = await listAiKeywords();
  if (current.length >= AI_KEYWORD_MAX) {
    return res.status(400).json({ message: `At most ${AI_KEYWORD_MAX} keywords are allowed.` });
  }

  const inserted = await db._pool.query(
    `INSERT INTO extractor_ai_keywords (workspace_id, keyword)
     VALUES ($1, $2)
     ON CONFLICT (workspace_id, lower(keyword)) DO UPDATE SET keyword = EXCLUDED.keyword
     RETURNING id, keyword, created_at`,
    [WORKSPACE, keyword],
  );

  return res.json({
    keyword: {
      id: inserted.rows[0].id,
      keyword: inserted.rows[0].keyword,
      createdAt: inserted.rows[0].created_at,
    },
    keywords: await listAiKeywords(),
  });
};

export const addAiKeywordsBulk = async (req, res) => {
  const incoming = Array.isArray(req.body?.keywords) ? req.body.keywords : [];
  if (incoming.length === 0) {
    return res.status(400).json({ message: 'Provide at least one keyword.' });
  }

  const current = await listAiKeywords();
  const seen = new Set(current.map((item) => item.keyword.toLowerCase()));
  let room = Math.max(0, AI_KEYWORD_MAX - current.length);
  let added = 0;
  let skipped = 0;

  for (const raw of incoming) {
    const keyword = normaliseKeyword(raw);
    if (!keyword) { skipped += 1; continue; }
    if (seen.has(keyword.toLowerCase())) { skipped += 1; continue; }
    if (room <= 0) { skipped += 1; continue; }

    await db._pool.query(
      `INSERT INTO extractor_ai_keywords (workspace_id, keyword)
       VALUES ($1, $2)
       ON CONFLICT (workspace_id, lower(keyword)) DO UPDATE SET keyword = EXCLUDED.keyword`,
      [WORKSPACE, keyword],
    );
    seen.add(keyword.toLowerCase());
    room -= 1;
    added += 1;
  }

  return res.json({ added, skipped, keywords: await listAiKeywords() });
};

export const deleteAiKeyword = async (req, res) => {
  if (!UUID_RE.test(String(req.params.id || ''))) {
    return res.status(404).json({ message: 'Keyword not found.' });
  }
  const deleted = await db._pool.query(
    `DELETE FROM extractor_ai_keywords WHERE id = $1 AND workspace_id = $2 RETURNING id`,
    [req.params.id, WORKSPACE],
  );
  if (deleted.rows.length === 0) return res.status(404).json({ message: 'Keyword not found.' });
  return res.json({ deleted: true, keywords: await listAiKeywords() });
};

export const runAiTagging = async (req, res) => {
  const scope = String(req.body?.scope || 'pending').toLowerCase();
  let queued = 0;

  if (scope === 'all') {
    const result = await db._pool.query(
      `UPDATE extractor_leads
          SET ai_status = 'pending', ai_tags = '{}', ai_score = NULL,
              ai_reason = NULL, ai_processed_at = NULL
        WHERE workspace_id = $1`,
      [WORKSPACE],
    );
    queued = result.rowCount ?? 0;
  } else if (scope === 'failed' || scope === 'error') {
    const result = await db._pool.query(
      `UPDATE extractor_leads
          SET ai_status = 'pending', ai_reason = NULL
        WHERE workspace_id = $1 AND ai_status = 'error'`,
      [WORKSPACE],
    );
    queued = result.rowCount ?? 0;
  } else {
    const result = await db._pool.query(
      `SELECT COUNT(*)::int AS n FROM extractor_leads
        WHERE workspace_id = $1 AND ai_status = 'pending'`,
      [WORKSPACE],
    );
    queued = result.rows[0]?.n ?? 0;
  }

  const keywords = await listAiKeywords();
  const configured = isAiConfigured();
  if (configured && keywords.length > 0 && queued > 0) kickExtractorAiWorkerNow();

  return res.json({
    scope,
    queued,
    configured,
    keywords: keywords.length,
    counts: await aiCounts(),
  });
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const listLeads = async (req, res) => {
  const page = clampInt(req.query.page, 1, 1, 100000);
  const pageSize = clampInt(req.query.pageSize, 25, 1, 100);
  const sort = SORT_COLUMNS[req.query.sort] || SORT_COLUMNS.createdAt;
  const order = String(req.query.order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const { sql: whereSql, params } = buildLeadWhere(req.query);

  const countResult = await db._pool.query(
    `SELECT COUNT(*)::int AS total FROM extractor_leads l ${whereSql}`,
    params,
  );
  const total = countResult.rows[0]?.total || 0;

  const listParams = [...params, pageSize, (page - 1) * pageSize];
  const result = await db._pool.query(
    `SELECT l.* FROM extractor_leads l
     ${whereSql}
     ORDER BY ${sort} ${order} NULLS LAST, l.id
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );

  return res.json({
    results: result.rows.map(mapLead),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  });
};

export const leadStats = async (req, res) => {
  const [totals, batches, statuses] = await Promise.all([
    db._pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE phone_e164 IS NOT NULL)::int AS with_phone,
        COUNT(*) FILTER (WHERE website IS NOT NULL)::int AS with_website,
        COUNT(*) FILTER (WHERE email IS NOT NULL)::int AS with_email,
        COUNT(*) FILTER (WHERE captured_at >= date_trunc('day', NOW()))::int AS captured_today,
        COUNT(*) FILTER (WHERE captured_at >= NOW() - INTERVAL '7 days')::int AS captured_7d,
        MAX(captured_at) AS last_captured_at
      FROM extractor_leads
      WHERE workspace_id = $1
    `, [WORKSPACE]),
    db._pool.query(`
      SELECT COUNT(*)::int AS batch_count, MAX(captured_at) AS last_batch_at
        FROM extractor_capture_batches
       WHERE workspace_id = $1
    `, [WORKSPACE]),
    db._pool.query(`
      SELECT lead_status, COUNT(*)::int AS n
        FROM extractor_leads
       WHERE workspace_id = $1
       GROUP BY lead_status
    `, [WORKSPACE]),
  ]);

  const t = totals.rows[0] || {};
  const b = batches.rows[0] || {};
  const byStatus = {};
  for (const row of statuses.rows) byStatus[row.lead_status] = row.n;

  return res.json({
    ok: true,
    total: t.total || 0,
    withPhone: t.with_phone || 0,
    withWebsite: t.with_website || 0,
    withEmail: t.with_email || 0,
    capturedToday: t.captured_today || 0,
    captured7d: t.captured_7d || 0,
    lastCapturedAt: t.last_captured_at || null,
    batchCount: b.batch_count || 0,
    lastBatchAt: b.last_batch_at || null,
    byStatus,
  });
};

/**
 * Distinct categories actually present in the data. The Leads filter uses this
 * instead of the categories on the current page, which would silently hide every
 * category that only appears on page 2+.
 */
export const listCategories = async (req, res) => {
  const result = await db._pool.query(`
    SELECT category, MAX(category_label) AS category_label, COUNT(*)::int AS n
      FROM extractor_leads
     WHERE category IS NOT NULL
     GROUP BY category
     ORDER BY n DESC, category
  `);
  return res.json({
    categories: result.rows.map((row) => ({
      id: row.category,
      label: row.category_label || row.category,
      count: row.n,
    })),
  });
};

export const listBatches = async (req, res) => {  const limit = clampInt(req.query.limit, 100, 1, 500);
  const result = await db._pool.query(
    `SELECT b.*,
            (SELECT COUNT(*)::int
               FROM extractor_capture_batch_items bi
              WHERE bi.batch_id = b.batch_id AND bi.workspace_id = b.workspace_id) AS lead_count
       FROM extractor_capture_batches b
      ORDER BY b.captured_at DESC NULLS LAST, b.created_at DESC
      LIMIT $1`,
    [limit],
  );
  return res.json({ batches: result.rows.map(mapBatch) });
};

export const updateLead = async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(String(id || ''))) {
    return res.status(404).json({ message: 'Lead not found.' });
  }
  const patch = req.body || {};
  const sets = [];
  const params = [];

  if (patch.leadStatus !== undefined) {
    if (!LEAD_STATUSES.includes(patch.leadStatus)) {
      return res.status(400).json({ message: `Unknown lead status: ${patch.leadStatus}` });
    }
    params.push(patch.leadStatus);
    sets.push(`lead_status = $${params.length}`);
  }
  if (patch.ownerName !== undefined) {
    params.push(text(patch.ownerName, 200));
    sets.push(`owner_name = $${params.length}`);
  }
  if (Array.isArray(patch.tags)) {
    params.push(patch.tags.map((t) => text(t, 80)).filter(Boolean));
    sets.push(`tags = $${params.length}`);
  }

  if (sets.length === 0) return res.status(400).json({ message: 'Nothing to update.' });

  params.push(id);
  const updated = await db._pool.query(
    `UPDATE extractor_leads SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $${params.length} RETURNING *`,
    params,
  );
  if (updated.rows.length === 0) return res.status(404).json({ message: 'Lead not found.' });
  return res.json({ lead: mapLead(updated.rows[0]) });
};

export const deleteLead = async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(String(id || ''))) {
    return res.status(404).json({ message: 'Lead not found.' });
  }
  const client = await db._pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT id, row_hash FROM extractor_leads WHERE id = $1 FOR UPDATE', [id]);
    if (found.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Lead not found.' });
    }
    const rowHash = found.rows[0].row_hash;
    await client.query('DELETE FROM extractor_capture_batch_items WHERE row_hash = $1', [rowHash]);
    await client.query('DELETE FROM extractor_leads WHERE id = $1', [id]);
    await client.query('COMMIT');
    return res.json({ deleted: true, id });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
};

export const deleteBatch = async (req, res) => {
  const batchId = text(req.params.batchId, 120);
  const client = await db._pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM extractor_capture_batch_items WHERE batch_id = $1', [batchId]);
    const deleted = await client.query(
      'DELETE FROM extractor_capture_batches WHERE batch_id = $1 RETURNING batch_id',
      [batchId],
    );
    await client.query('COMMIT');
    if (deleted.rows.length === 0) return res.status(404).json({ message: 'Batch not found.' });
    return res.json({ deleted: true, batchId });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
};

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/["\n\r,]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportRow(lead) {
  const region = [lead.phoneRegionCity, lead.phoneRegionState].filter(Boolean).join(', ');
  const source = (lead.sourceNames || []).join(', ');
  return {
    businessName: lead.displayName,
    phoneRaw: lead.phoneRaw,
    phoneE164: lead.phoneE164,
    phoneLineType: lead.phoneLineType,
    category: lead.categoryLabel || lead.category,
    region: region || 'Not available',
    regionCity: lead.phoneRegionCity,
    regionState: lead.phoneRegionState,
    regionSource: lead.phoneRegionSource,
    address: lead.address,
    website: lead.website,
    email: lead.email,
    leadStatus: lead.leadStatusLabel || lead.leadStatus,
    verificationStatus: lead.verificationStatus,
    aiTags: (lead.aiTags || []).join('; '),
    aiScore: lead.aiScore,
    aiReason: lead.aiReason,
    aiStatus: lead.aiStatus,
    source,
    sourceUrl: lead.sourceUrl,
    batchId: lead.lastBatchId,
    capturedAt: lead.capturedAt,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  };
}

export const exportLeads = async (req, res) => {
  const format = String(req.query.format || 'whatsapp').toLowerCase() === 'full' ? 'full' : 'whatsapp';
  const columns = EXPORT_COLUMNS[format];
  const { sql: whereSql, params } = buildLeadWhere(req.query);

  params.push(MAX_EXPORT_ROWS);
  const result = await db._pool.query(
    `SELECT l.* FROM extractor_leads l
     ${whereSql}
     ORDER BY l.created_at DESC
     LIMIT $${params.length}`,
    params,
  );

  const lines = [columns.map((c) => csvEscape(c.label)).join(',')];
  for (const row of result.rows) {
    const mapped = exportRow(mapLead(row));
    lines.push(columns.map((c) => csvEscape(mapped[c.key])).join(','));
  }

  const csv = `\uFEFF${lines.join('\r\n')}`;
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="ucs-extractor-leads-${format}-${stamp}.csv"`,
  );
  return res.send(csv);
};

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const status = async (req, res) => {
  try {
    const tables = await db._pool.query(
      `SELECT to_regclass('public.extractor_leads')          AS leads,
              to_regclass('public.extractor_capture_batches') AS batches,
              to_regclass('public.extractor_capture_batch_items') AS items`,
    );
    const t = tables.rows[0] || {};
    const ready = Boolean(t.leads && t.batches && t.items);

    if (!ready) {
      return res.json({
        ok: false,
        ready: false,
        message: 'Extractor tables are missing. Restart the backend to run the schema bootstrap.',
        tables: { leads: Boolean(t.leads), batches: Boolean(t.batches), items: Boolean(t.items) },
      });
    }

    const counts = await db._pool.query(`
      SELECT (SELECT COUNT(*)::int FROM extractor_leads) AS leads,
             (SELECT COUNT(*)::int FROM extractor_capture_batches) AS batches,
             (SELECT MAX(captured_at) FROM extractor_capture_batches) AS last_capture
    `);
    const c = counts.rows[0] || {};

    return res.json({
      ok: true,
      ready: true,
      leads: c.leads || 0,
      batches: c.batches || 0,
      lastCaptureAt: c.last_capture || null,
      tables: { leads: true, batches: true, items: true },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err?.message || 'Status check failed.' });
  }
};

// ---------------------------------------------------------------------------
// Extension package download
// ---------------------------------------------------------------------------

const EXTENSION_FILES = [
  'manifest.json',
  'background.js',
  'content.js',
  'sidepanel.html',
  'sidepanel.css',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png',
];

async function findExtensionDir() {
  const candidates = [
    path.resolve(__dirname, '../../../extractor/extension/release'),
    path.resolve(__dirname, '../../../extractor/extension'),
    path.resolve(process.cwd(), 'extractor/extension/release'),
    path.resolve(process.cwd(), '../extractor/extension/release'),
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
  return `UCS Extractor - Capture (Chrome Extension)
==========================================

This package is already configured for your CRM account.

Install
-------
1. Open chrome://extensions in Chrome.
2. Turn on "Developer mode" (top right).
3. Click "Load unpacked" and select this unzipped folder.
4. Pin the extension so it is easy to open.

Use
---
1. Open the extension side panel.
2. Paste one search per line (Google Maps or Bing), pick a region, press Start.
3. Or open a page that lists businesses and press Start capture.
4. Saved rows appear in CRM: Accounts > Extractor > Leads.

Settings
--------
API Base : ${apiBase}
The token is inside config.js. Do not share this folder with anyone.
If the token expires, download a fresh package from Accounts > Extractor.

Troubleshooting
---------------
- After installing or updating, reload the extension on chrome://extensions.
- Keep the captured tab open until the side panel reports the saved count.
- If a capture fails, rows are held locally and retried.
- Google Maps result cards do not show phone numbers; use the "read each result"
  option so the extension opens place pages and reads them.
`;
}

export const downloadExtension = async (req, res) => {
  try {
    const dir = await findExtensionDir();
    if (!dir) {
      return res.status(404).json({
        message: 'Extractor extension build not found on the server. Expected extractor/extension/release.',
      });
    }

    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const proto = forwardedProto || req.protocol || 'http';
    const host = String(req.headers['x-forwarded-host'] || req.get('host') || 'localhost:5000')
      .split(',')[0]
      .trim();
    const apiBase = text(req.query.apiBase, 500) || `${proto}://${host}`;

    const zip = new JSZip();
    for (const file of EXTENSION_FILES) {
      try {
        zip.file(file, await fs.readFile(path.join(dir, file)));
      } catch { /* file not present, skip */ }
    }

    // The bundle is a single IIFE service worker. `importScripts` has to run
    // before it, so the pre-configuration is prepended rather than appended.
    try {
      const background = await fs.readFile(path.join(dir, 'background.js'), 'utf8');
      zip.file('background.js', `importScripts("config.js");\n${background}`);
    } catch {
      return res.status(500).json({ message: 'background.js is missing from the extension build.' });
    }

    zip.file(
      'config.js',
      `// Auto-generated by UCS CRM on ${new Date().toISOString()}.\n` +
      `// This file contains your CRM token. Do not share it.\n` +
      `globalThis.UCS_EXTRACTOR_CONFIG = ${JSON.stringify({ apiBase, token }, null, 2)};\n`,
    );
    zip.file('INSTALL.txt', extensionReadme({ apiBase }));

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="ucs-extractor-capture.zip"');
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    console.error('extractor downloadExtension error:', err);
    return res.status(500).json({ message: err.message || 'Internal error' });
  }
};
