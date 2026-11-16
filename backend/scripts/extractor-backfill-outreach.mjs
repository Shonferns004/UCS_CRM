#!/usr/bin/env node
/**
 * Backfill the global "already messaged" list from existing bulk campaigns.
 *
 *   node backend/scripts/extractor-backfill-outreach.mjs           # dry run
 *   node backend/scripts/extractor-backfill-outreach.mjs --apply   # write
 *
 * Source of truth is whatsapp_bulk_recipients: a row exists only after Meta
 * returned a message id, so every status except 'failed' means the message was
 * accepted. Campaign JSONB is unioned in for older sends whose log row is gone.
 *
 * Failed-only numbers are deliberately NOT marked used: they never received the
 * message and may be retried.
 */
import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

const CANON = (expr) => `(
  CASE
    WHEN length(regexp_replace(${expr}, '[^0-9]', '', 'g')) = 10
      THEN '91' || regexp_replace(${expr}, '[^0-9]', '', 'g')
    WHEN length(regexp_replace(${expr}, '[^0-9]', '', 'g')) = 11
     AND regexp_replace(${expr}, '[^0-9]', '', 'g') LIKE '0%'
      THEN '91' || substr(regexp_replace(${expr}, '[^0-9]', '', 'g'), 2)
    ELSE regexp_replace(${expr}, '[^0-9]', '', 'g')
  END
)`;

const SOURCE_CTE = `
  WITH raw AS (
    SELECT phone AS phone, created_at AS at, campaign_id AS cid
      FROM whatsapp_bulk_recipients
     WHERE COALESCE(status, '') <> 'failed'
    UNION ALL
    SELECT item->>'phone', COALESCE(c.completed_at, c.created_at), c.id
      FROM campaigns c, jsonb_array_elements(COALESCE(c.recipients, '[]'::jsonb)) item
     WHERE item->>'status' = 'sent'
  ),
  norm AS (
    SELECT ${CANON('phone')} AS digits, at, cid
      FROM raw
     WHERE COALESCE(phone, '') <> ''
  ),
  agg AS (
    SELECT digits,
           MAX(at) AS sent_at,
           (ARRAY_AGG(cid ORDER BY at DESC NULLS LAST))[1] AS campaign_id
      FROM norm
     GROUP BY digits
  )
`;

async function main() {
  await client.connect();

  console.log('UCS Extractor outreach backfill');
  console.log(`  mode: ${APPLY ? 'APPLY (writes rows)' : 'dry run (no writes)'}`);

  const stats = await client.query(`
    ${SOURCE_CTE}
    SELECT
      (SELECT COUNT(*)::int FROM agg) AS source_numbers,
      (SELECT COUNT(*)::int FROM agg a
        WHERE EXISTS (
          SELECT 1 FROM extractor_leads l
           WHERE regexp_replace(l.phone_e164, '[^0-9]', '', 'g') = a.digits
        ))::int AS matched_extractor,
      (SELECT COUNT(*)::int FROM extractor_lead_outreach) AS already_marked,
      (SELECT COUNT(*)::int FROM agg a
        WHERE EXISTS (
          SELECT 1 FROM extractor_lead_outreach o WHERE o.phone_e164 = a.digits
        ))::int AS already_present
    FROM agg LIMIT 1
  `);

  const s = stats.rows[0];
  console.log('\nSource (successful sends only):');
  console.log(`  distinct numbers      : ${s.source_numbers}`);
  console.log(`  match extractor leads : ${s.matched_extractor}`);
  console.log(`  already marked        : ${s.already_marked}`);
  console.log(`  already in this set   : ${s.already_present}`);
  console.log('\nFailed-only numbers are ignored (not messaged, can be retried).');

  if (!APPLY) {
    console.log('\nDry run complete. Re-run with --apply to write.');
    return;
  }

  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  console.log(`\nBackup: extractor_lead_outreach_backup_${stamp}`);
  await client.query(
    `CREATE TABLE IF NOT EXISTS "extractor_lead_outreach_backup_${stamp}"
       AS SELECT * FROM extractor_lead_outreach`,
  );

  await client.query('BEGIN');
  try {
    const written = await client.query(`
      ${SOURCE_CTE}
      INSERT INTO extractor_lead_outreach (phone_e164, lead_id, campaign_id, ngo_id, status, sent_at)
      SELECT a.digits, l.id, a.campaign_id, NULL, 'sent', COALESCE(a.sent_at, NOW())
        FROM agg a
        LEFT JOIN LATERAL (
          SELECT id FROM extractor_leads
           WHERE regexp_replace(phone_e164, '[^0-9]', '', 'g') = a.digits
           ORDER BY captured_at DESC NULLS LAST, id
           LIMIT 1
        ) l ON TRUE
      ON CONFLICT (phone_e164) DO UPDATE SET
        status = 'sent',
        sent_at = EXCLUDED.sent_at,
        updated_at = NOW(),
        lead_id = COALESCE(extractor_lead_outreach.lead_id, EXCLUDED.lead_id),
        campaign_id = COALESCE(extractor_lead_outreach.campaign_id, EXCLUDED.campaign_id)
      RETURNING phone_e164
    `);
    await client.query('COMMIT');
    console.log(`Upserted outreach rows: ${written.rows.length}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  const after = await client.query(`
    WITH numbers AS (
      SELECT DISTINCT regexp_replace(phone_e164, '[^0-9]', '', 'g') AS digits
        FROM extractor_leads
       WHERE phone_e164 IS NOT NULL AND phone_line_type = 'mobile'
    )
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (
             WHERE EXISTS (SELECT 1 FROM extractor_lead_outreach o WHERE o.phone_e164 = numbers.digits)
           )::int AS used
      FROM numbers
  `);
  const a = after.rows[0];
  console.log('\nExtractor availability now:');
  console.log(`  total    : ${a.total}`);
  console.log(`  used     : ${a.used}`);
  console.log(`  available: ${a.total - a.used}`);
  console.log(`\nBackup kept as extractor_lead_outreach_backup_${stamp}`);
}

main()
  .catch((err) => {
    console.error('\nBackfill failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => client.end().catch(() => {}));
