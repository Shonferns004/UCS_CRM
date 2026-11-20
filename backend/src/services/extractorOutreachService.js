/**
 * Global "already messaged" tracking for Extractor leads.
 *
 * The used key is the phone number, not the lead: WhatsApp identity is the
 * number, and the same number can appear under two captured rows.
 *
 * A number is marked used when Meta accepts the send (it returns a message id),
 * because that is the only synchronous proof the CRM gets. Acceptance is not
 * delivery, though: Meta can fail the message afterwards from a status webhook
 * (131042 business eligibility, 131026 undeliverable, ...). Those numbers are
 * released again by releaseFailedExtractorPhones() so the lead becomes
 * available in Extractor and can be retried once the cause is fixed.
 */
import db from '../config/db.js';

/** Same normalisation the bulk sender uses: digits, 10-digit numbers get 91. */
export function canonicalPhone(value) {
  const raw = String(value || '').replace(/\D/g, '');
  if (raw.length === 10) return `91${raw}`;
  if (raw.length === 11 && raw.startsWith('0')) return `91${raw.slice(1)}`;
  return raw;
}

/** Which of these numbers have already received a bulk message. */
export async function usedPhoneSet(phones) {
  const list = [...new Set((Array.isArray(phones) ? phones : []).map(canonicalPhone).filter(Boolean))];
  if (list.length === 0) return new Set();
  const { rows } = await db._pool.query(
    `SELECT phone_e164 FROM extractor_lead_outreach WHERE phone_e164 = ANY($1::text[])`,
    [list],
  );
  return new Set(rows.map((row) => row.phone_e164));
}

/**
 * Mark numbers used (after a successful send / manual override) or unused.
 * Used is idempotent: a re-run refreshes sent_at but never duplicates a row.
 */
export async function markExtractorPhones({
  phones,
  used = true,
  ngoId = null,
  campaignId = null,
} = {}) {
  const list = [...new Set((Array.isArray(phones) ? phones : []).map(canonicalPhone).filter(Boolean))];
  if (list.length === 0) return { changed: 0, phones: [] };

  if (!used) {
    const result = await db._pool.query(
      `DELETE FROM extractor_lead_outreach WHERE phone_e164 = ANY($1::text[])`,
      [list],
    );
    return { changed: result.rowCount ?? 0, phones: list };
  }

  const { rows } = await db._pool.query(
    `INSERT INTO extractor_lead_outreach (phone_e164, lead_id, campaign_id, ngo_id, status, sent_at)
     SELECT p.digits, l.id, $2::uuid, $3, 'sent', NOW()
       FROM unnest($1::text[]) AS p(digits)
       LEFT JOIN LATERAL (
         SELECT id FROM extractor_leads
          WHERE regexp_replace(phone_e164, '[^0-9]', '', 'g') = p.digits
          ORDER BY captured_at DESC NULLS LAST, id
          LIMIT 1
       ) l ON TRUE
     ON CONFLICT (phone_e164) DO UPDATE SET
       status = 'sent',
       sent_at = NOW(),
       updated_at = NOW(),
       lead_id = COALESCE(EXCLUDED.lead_id, extractor_lead_outreach.lead_id),
       campaign_id = COALESCE(EXCLUDED.campaign_id, extractor_lead_outreach.campaign_id),
       ngo_id = COALESCE(EXCLUDED.ngo_id, extractor_lead_outreach.ngo_id)
     RETURNING phone_e164`,
    [list, campaignId || null, ngoId || null],
  );

  return { changed: rows.length, phones: list };
}

/** Record one successful send. Called by the campaign sender. */
export async function recordExtractorOutreach({
  phone,
  ngoId = null,
  campaignId = null,
} = {}) {
  const digits = canonicalPhone(phone);
  if (!digits) return { changed: 0 };
  return markExtractorPhones({ phones: [digits], used: true, ngoId, campaignId });
}

/**
 * Release numbers whose bulk message was accepted and then failed.
 *
 * Called from the delivery-status webhook. A number is freed only when every
 * bulk message logged for it is failed; if any other send to the same number
 * was accepted / sent / delivered / read, the number stays used. That keeps a
 * failure in one campaign from freeing a number that already received another
 * message.
 *
 * Returns the numbers that were actually released.
 */
export async function releaseFailedExtractorPhones(phones) {
  const list = [...new Set((Array.isArray(phones) ? phones : []).map(canonicalPhone).filter(Boolean))];
  if (list.length === 0) return [];

  const { rows } = await db._pool.query(
    `DELETE FROM extractor_lead_outreach o
      WHERE o.phone_e164 = ANY($1::text[])
        AND EXISTS (
          SELECT 1 FROM whatsapp_bulk_recipients r
           WHERE r.phone = o.phone_e164
        )
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_bulk_recipients r
           WHERE r.phone = o.phone_e164
             AND COALESCE(r.status, '') <> 'failed'
        )
      RETURNING o.phone_e164`,
    [list],
  );
  return rows.map((row) => row.phone_e164);
}

/** Global totals: distinct mobile numbers, and how many were messaged. */
export async function getExtractorOutreachCounts() {
  const { rows } = await db._pool.query(`
    WITH numbers AS (
      SELECT DISTINCT regexp_replace(phone_e164, '[^0-9]', '', 'g') AS digits
        FROM extractor_leads
       WHERE phone_e164 IS NOT NULL
         AND phone_line_type = 'mobile'
    )
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM extractor_lead_outreach o WHERE o.phone_e164 = numbers.digits
             )
           )::int AS used
      FROM numbers
  `);
  const total = rows[0]?.total || 0;
  const used = rows[0]?.used || 0;
  return { total, used, available: Math.max(0, total - used) };
}

const SORTS = {
  oldest: 'captured_at ASC NULLS LAST, id',
  newest: 'captured_at DESC NULLS LAST, id',
  score: 'ai_score DESC NULLS LAST, captured_at ASC NULLS LAST, id',
};

/**
 * Extractor leads that can be bulk-messaged.
 *
 * One row per phone (the oldest capture wins), joined to the global usage table.
 * `onlyUnused` is the default; `counts` are global, `filtered` is after the
 * filters so the UI can say "500 of 1,342".
 */
export async function listExtractorCandidates(options = {}) {
  const q = String(options.q || '').trim();
  const category = String(options.category || '').trim();
  const aiTag = String(options.aiTag || '').trim();
  const city = String(options.city || '').trim();
  const batchId = String(options.batchId || '').trim();
  const minScore = options.minScore === undefined || options.minScore === null || options.minScore === ''
    ? null
    : Math.max(0, Math.min(100, Number(options.minScore)));
  const onlyUnused = options.onlyUnused !== false && String(options.onlyUnused) !== 'false';
  const usage = ['unused', 'used', 'all'].includes(String(options.usage))
    ? String(options.usage)
    : (onlyUnused ? 'unused' : 'all');
  const sort = SORTS[options.sort] ? String(options.sort) : 'oldest';
  const limit = Math.min(2000, Math.max(1, parseInt(options.limit, 10) || 200));
  const offset = Math.max(0, parseInt(options.offset, 10) || 0);

  const params = [];
  const where = ["l.phone_e164 IS NOT NULL", "l.phone_line_type = 'mobile'"];

  if (q) {
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    where.push(`(l.display_name ILIKE ${p} OR l.phone_e164 ILIKE ${p} OR l.address ILIKE ${p})`);
  }
  if (category) {
    params.push(category);
    where.push(`l.category = $${params.length}`);
  }
  if (aiTag) {
    params.push(aiTag);
    where.push(`$${params.length} = ANY(l.ai_tags)`);
  }
  if (minScore !== null && Number.isFinite(minScore)) {
    params.push(minScore);
    where.push(`l.ai_score IS NOT NULL AND l.ai_score >= $${params.length}`);
  }
  if (city) {
    params.push(`%${city}%`);
    where.push(`(l.phone_region_city ILIKE $${params.length} OR l.address ILIKE $${params.length})`);
  }
  if (batchId) {
    params.push(batchId);
    where.push(`EXISTS (
      SELECT 1 FROM extractor_capture_batch_items bi
       WHERE bi.row_hash = l.row_hash AND bi.batch_id = $${params.length}
    )`);
  }

  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const { rows } = await db._pool.query(
    `WITH base AS (
       SELECT l.id, l.display_name, l.phone_e164,
              regexp_replace(l.phone_e164, '[^0-9]', '', 'g') AS digits,
              l.phone_region_city, l.phone_region_state,
              l.category, l.category_label, l.ai_score, l.ai_tags, l.captured_at,
              ROW_NUMBER() OVER (
                PARTITION BY regexp_replace(l.phone_e164, '[^0-9]', '', 'g')
                ORDER BY l.captured_at ASC NULLS LAST, l.id
              ) AS rn
         FROM extractor_leads l
        WHERE ${where.join(' AND ')}
     ),
     dedup AS (SELECT * FROM base WHERE rn = 1),
     joined AS (
       SELECT d.*, o.sent_at AS used_at, (o.id IS NOT NULL) AS used
         FROM dedup d
         LEFT JOIN extractor_lead_outreach o ON o.phone_e164 = d.digits
     )
     SELECT *, COUNT(*) OVER()::int AS filtered
       FROM joined
      ${usage === 'unused' ? 'WHERE used = false' : usage === 'used' ? 'WHERE used = true' : ''}
      ORDER BY ${SORTS[sort]}
      LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    [...params, limit, offset],
  );

  const counts = await getExtractorOutreachCounts();
  const filtered = rows[0]?.filtered ?? 0;

  const { rows: categoryRows } = await db._pool.query(`
    SELECT category AS id, MAX(category_label) AS label, COUNT(*)::int AS count
      FROM extractor_leads
     WHERE category IS NOT NULL
       AND phone_e164 IS NOT NULL
       AND phone_line_type = 'mobile'
     GROUP BY category
     ORDER BY count DESC, category
  `);

  return {
    counts,
    filtered,
    categories: categoryRows.map((row) => ({
      id: row.id,
      label: row.label || row.id,
      count: row.count,
    })),
    leads: rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      phone: row.digits,
      phoneE164: row.phone_e164,
      city: row.phone_region_city,
      state: row.phone_region_state,
      category: row.category,
      categoryLabel: row.category_label,
      aiScore: row.ai_score,
      aiTags: row.ai_tags || [],
      capturedAt: row.captured_at,
      used: row.used === true,
      usedAt: row.used_at,
    })),
  };
}
