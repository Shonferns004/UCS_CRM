#!/usr/bin/env node
/**
 * Release Extractor numbers that were marked "used" by a send Meta accepted and
 * then failed.
 *
 *   node backend/scripts/extractor-release-failed-outreach.mjs                  # dry run, all campaigns
 *   node backend/scripts/extractor-release-failed-outreach.mjs --campaign <id>  # dry run, one campaign
 *   node backend/scripts/extractor-release-failed-outreach.mjs --campaign <id> --apply
 *
 * The used list is written when Meta returns a message id, so 131042 / 131026
 * failures that arrive later leave the number marked used. This script finds
 * those rows and removes them, but only when EVERY bulk message logged for that
 * number is failed. A number that received a different successful message stays
 * used.
 *
 * The runtime path is the delivery-status webhook
 * (backend/src/controllers/whatsappWebhookController.js); this script is the
 * one-time repair for rows that failed before that fix shipped.
 */
import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');
const campaignIndex = process.argv.indexOf('--campaign');
const CAMPAIGN_ID = campaignIndex >= 0 ? String(process.argv[campaignIndex + 1] || '').trim() : null;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
if (campaignIndex >= 0 && !CAMPAIGN_ID) {
  console.error('--campaign needs a campaign id.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

// A number is releasable when the outreach row exists, at least one bulk
// message was logged for it, and none of those messages is still successful.
const CANDIDATES_CTE = `
  WITH candidates AS (
    SELECT o.id, o.phone_e164, o.campaign_id, o.sent_at
      FROM extractor_lead_outreach o
     WHERE ($1::uuid IS NULL OR o.campaign_id = $1::uuid)
       AND EXISTS (
         SELECT 1 FROM whatsapp_bulk_recipients r
          WHERE r.phone = o.phone_e164
       )
       AND NOT EXISTS (
         SELECT 1 FROM whatsapp_bulk_recipients r
          WHERE r.phone = o.phone_e164
            AND COALESCE(r.status, '') <> 'failed'
       )
  )
`;

async function main() {
  await client.connect();

  console.log('UCS Extractor release of failed sends');
  console.log(`  mode    : ${APPLY ? 'APPLY (deletes rows)' : 'dry run (no writes)'}`);
  console.log(`  campaign: ${CAMPAIGN_ID || 'all'}`);

  if (CAMPAIGN_ID) {
    const found = await client.query('SELECT id, name, status FROM campaigns WHERE id = $1::uuid', [CAMPAIGN_ID]);
    if (!found.rows.length) {
      console.error('\nNo campaign with that id.');
      return;
    }
    console.log(`  name    : ${found.rows[0].name} (${found.rows[0].status})`);
  }

  const stats = await client.query(`
    ${CANDIDATES_CTE}
    SELECT
      (SELECT COUNT(*)::int FROM candidates) AS releasable,
      (SELECT COUNT(*)::int FROM extractor_lead_outreach) AS used_total
  `, [CAMPAIGN_ID]);

  const s = stats.rows[0];
  console.log('\nBefore:');
  console.log(`  used numbers      : ${s.used_total}`);
  console.log(`  releasable (failed): ${s.releasable}`);
  console.log(`  used after release: ${s.used_total - s.releasable}`);

  if (s.releasable === 0) {
    console.log('\nNothing to release.');
    return;
  }

  const sample = await client.query(`
    ${CANDIDATES_CTE}
    SELECT c.phone_e164,
           (SELECT COUNT(*)::int FROM whatsapp_bulk_recipients r WHERE r.phone = c.phone_e164) AS logged_sends
      FROM candidates c
     ORDER BY c.sent_at DESC NULLS LAST
     LIMIT 10
  `, [CAMPAIGN_ID]);
  console.log('\nSample:');
  for (const row of sample.rows) {
    console.log(`  ${row.phone_e164}  (${row.logged_sends} failed send(s))`);
  }

  if (!APPLY) {
    console.log('\nDry run complete. Re-run with --apply to delete these rows.');
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
    const deleted = await client.query(`
      ${CANDIDATES_CTE}
      DELETE FROM extractor_lead_outreach o
       USING candidates c
       WHERE o.id = c.id
      RETURNING o.phone_e164
    `, [CAMPAIGN_ID]);
    await client.query('COMMIT');
    console.log(`\nReleased ${deleted.rows.length} number(s) back to unused.`);
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
    console.error('\nRelease failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => client.end().catch(() => {}));
