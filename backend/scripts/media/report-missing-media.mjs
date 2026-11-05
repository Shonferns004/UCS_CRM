import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { urlToMediaKey, localPathForKey, mediaRoot } from '../../src/services/localMedia.js';

// ---------------------------------------------------------------------------
// Report media columns whose stored URL points at a file that is NOT present in
// the local media dump.
//
// AWS is suspended, so those rows cannot be recovered. The CSV this writes is
// the re-upload worklist: one line per missing document, selfie, photo or receipt.
//
// Usage (from backend/):
//   node scripts/media/report-missing-media.mjs [output.csv]
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(BACKEND_DIR, '.env') });

const OUT = process.argv[2] || path.join(BACKEND_DIR, 'missing-media-report.csv');
const root = mediaRoot();

if (!process.env.DATABASE_URL) {
  console.error('[media-report] DATABASE_URL is not set in backend/.env');
  process.exit(1);
}

const quoteIdent = (value) => `"${String(value).replace(/"/g, '""')}"`;
const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const MEDIA_COLUMN_HINT = `
  column_name ILIKE '%url%' OR column_name ILIKE '%photo%' OR
  column_name ILIKE '%image%' OR column_name ILIKE '%media%' OR
  column_name ILIKE '%signature%' OR column_name ILIKE '%file%' OR
  column_name ILIKE '%document%' OR column_name ILIKE '%attachment%' OR
  column_name ILIKE '%screenshot%'
`;

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const { rows: columns } = await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type IN ('text', 'character varying', 'character')
        AND (${MEDIA_COLUMN_HINT})
      ORDER BY table_name, column_name
    `);

    const missing = [];
    let totalFound = 0;
    let totalMissing = 0;
    let totalBareKeys = 0;

    for (const { table_name: table, column_name: column } of columns) {
      let rows;
      try {
        ({ rows } = await client.query(
          `SELECT ctid::text AS row_id, ${quoteIdent(column)}::text AS value
             FROM public.${quoteIdent(table)}
            WHERE ${quoteIdent(column)}::text ~* '(amazonaws\\.com|/api/media/)'`,
        ));
      } catch (err) {
        console.warn(`[media-report] skipped ${table}.${column}: ${err.message}`);
        continue;
      }

      for (const row of rows) {
        const key = urlToMediaKey(row.value);
        if (!key) {
          totalBareKeys += 1;
          continue;
        }
        let full;
        try {
          full = localPathForKey(key);
        } catch {
          totalMissing += 1;
          missing.push({ table, column, row_id: row.row_id, stored: row.value, expected: '', reason: 'unsafe-key' });
          continue;
        }
        if (fs.existsSync(full)) {
          totalFound += 1;
        } else {
          totalMissing += 1;
          missing.push({ table, column, row_id: row.row_id, stored: row.value, expected: full, reason: 'file-missing' });
        }
      }
    }

    const header = 'table,column,row_id,stored_url,expected_path,reason';
    const lines = missing.map((m) =>
      [m.table, m.column, m.row_id, m.stored, m.expected, m.reason].map(csvCell).join(','));
    fs.writeFileSync(OUT, `${header}\r\n${lines.join('\r\n')}\r\n`, 'utf8');

    console.log(`[media-report] media root: ${root}`);
    console.log(`[media-report] resolved: ${totalFound}`);
    console.log(`[media-report] missing:  ${totalMissing}`);
    console.log(`[media-report] unparsed values (not a URL/key): ${totalBareKeys}`);
    console.log(`[media-report] CSV: ${OUT}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[media-report] FAILED:', err.message);
  process.exitCode = 1;
});
