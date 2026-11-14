#!/usr/bin/env node
/**
 * Clone the standalone UCS Extractor data from Supabase into this CRM.
 *
 *   SOURCE_DATABASE_URL=postgres://...  (Supabase, read-only)
 *   DATABASE_URL=postgres://...         (ucs_crm, written)
 *
 *   node backend/scripts/extractor-import.mjs              # dry run (default)
 *   node backend/scripts/extractor-import.mjs --apply      # write, after backups
 *
 * Safety contract
 * ---------------
 * 1. The source session is put in READ ONLY mode. Postgres itself rejects any
 *    write/DDL attempted against Supabase, so no code path here can change it.
 * 2. Nothing is ever deleted or truncated. Target writes are inserts/upserts
 *    into extractor_leads / extractor_capture_batches /
 *    extractor_capture_batch_items only.
 * 3. `--apply` first snapshots the three target tables as
 *    <table>_backup_<stamp> so a bad import can be undone with one query.
 * 4. If SOURCE_DATABASE_URL and DATABASE_URL point at the same host+database,
 *    the script refuses to run.
 * 5. Timestamps are copied as-is; `now()` is never used for source rows.
 *
 * Identity
 * --------
 * Rows are keyed the way the application keys them: `row_hash` for leads,
 * `(batch_id, workspace_id)` for batches, `(batch_id, row_hash)` for membership.
 * The source UUID primary keys are NOT copied; nothing in the CRM joins on
 * them, and reusing them would make a partial re-run collide on the primary key.
 */
import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Always read backend/.env, no matter which directory the command was started
// from, so SOURCE_DATABASE_URL is found next to DATABASE_URL.
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');

const LEAD_COLUMNS = [
  'workspace_id', 'entity_type', 'display_name', 'category', 'category_label', 'address',
  'phone_e164', 'phone_raw', 'phone_region_state', 'phone_region_city',
  'phone_region_source', 'phone_line_type', 'website', 'email', 'cin',
  'source_names', 'source_url', 'captured_at', 'verification_status',
  'lead_status', 'owner_name', 'tags', 'last_fetched_at',
  'ai_tags', 'ai_score', 'ai_reason', 'ai_status', 'ai_model', 'ai_processed_at', 'ai_attempts',
  'email_status', 'email_checked_at', 'email_attempts', 'email_reason',
  'row_hash', 'first_batch_id', 'last_batch_id', 'created_at', 'updated_at',
];

const BATCH_COLUMNS = [
  'batch_id', 'session_id', 'workspace_id', 'source_name', 'source_url',
  'captured_at', 'row_count', 'accepted', 'updated', 'duplicates', 'rejected',
  'user_id', 'created_at',
];

const ITEM_COLUMNS = ['batch_id', 'row_hash', 'workspace_id', 'row_index', 'created_at'];

const LEAD_CONFLICT = 'row_hash';
const BATCH_CONFLICT = 'batch_id, workspace_id';
const ITEM_CONFLICT = 'batch_id, row_hash';

// A re-run must not undo work done in the CRM after the first import. Captured
// and enriched fields are refreshed from the source; pipeline state is kept.
const LEAD_PRESERVE_ON_CONFLICT = ['lead_status', 'owner_name', 'tags'];

function maskUrl(value) {
  if (!value) return '(unset)';
  try {
    const u = new URL(value);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '(invalid URL)';
  }
}

function sameDatabase(a, b) {
  try {
    const left = new URL(a);
    const right = new URL(b);
    const norm = (u) => `${u.hostname}:${u.port || '5432'}${u.pathname}`.toLowerCase();
    return norm(left) === norm(right);
  } catch {
    return false;
  }
}

/**
 * SSL heuristic. Supabase requires SSL; a local LAN Postgres usually refuses it.
 * An explicit SOURCE_/DATABASE_SSL flag always wins.
 */
function sslOption(url, flag) {
  if (flag === 'false') return false;
  if (flag === 'true') return { rejectUnauthorized: false };
  try {
    const host = new URL(url).hostname;
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return false;
    }
  } catch { /* fall through to SSL */ }
  return { rejectUnauthorized: false };
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

async function tableExists(client, table) {
  const { rows } = await client.query(
    `SELECT to_regclass($1) IS NOT NULL AS present`,
    [`public.${table}`],
  );
  return rows[0]?.present === true;
}

async function commonColumns(client, table, wanted) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  const present = new Set(rows.map((r) => r.column_name));
  return wanted.filter((c) => present.has(c));
}

/**
 * Refuse to import from a database whose `leads` table is not the extractor's.
 *
 * The CRM itself has a table called `leads`; pointing SOURCE_DATABASE_URL at the
 * wrong database would otherwise "succeed" by importing the wrong rows. These
 * columns are unique to the standalone extractor schema.
 */
async function assertExtractorSource(client) {
  const required = {
    leads: ['row_hash', 'display_name', 'entity_type', 'phone_e164'],
    capture_batches: ['batch_id', 'session_id', 'source_name'],
    capture_batch_items: ['batch_id', 'row_hash'],
  };

  let present = 0;
  for (const [table, expected] of Object.entries(required)) {
    if (!(await tableExists(client, table))) continue;
    present += 1;
    const columns = new Set(await commonColumns(client, table, expected));
    const missing = expected.filter((c) => !columns.has(c));
    if (missing.length) {
      throw new Error(
        `Source table "${table}" does not look like the UCS Extractor schema ` +
        `(missing: ${missing.join(', ')}). Refusing to import from the wrong database.`,
      );
    }
  }

  if (present === 0) {
    throw new Error(
      'None of leads / capture_batches / capture_batch_items exist on the source. ' +
      'Check that SOURCE_DATABASE_URL points at the UcsExtractor Supabase project.',
    );
  }
}

/** Read every row of `table` in keyset order, so a long import never uses OFFSET. */
async function* readRows(client, table, columns, orderBy, pageSize = 1000) {
  // Order columns have to be selected even when they are not part of the
  // payload, otherwise the keyset cursor would be undefined and the loop would
  // restart forever.
  const selected = Array.from(new Set([...columns, ...orderBy]));
  const selectCols = selected.map((c) => `"${c}"`).join(', ');
  const orderCols = orderBy.map((c) => `"${c}"`).join(', ');
  const tuples = `(${orderBy.map((c) => `"${c}"`).join(', ')})`;
  let cursor = null;

  for (;;) {
    const params = cursor ? cursor : [];
    const where = cursor
      ? `WHERE ${tuples} > (${orderBy.map((_, i) => `$${i + 1}`).join(', ')})`
      : '';
    const limitIndex = params.length + 1;
    const { rows } = await client.query(
      `SELECT ${selectCols} FROM "${table}" ${where}
        ORDER BY ${orderCols} LIMIT $${limitIndex}`,
      [...params, pageSize],
    );
    if (rows.length === 0) return;
    yield rows;
    const last = rows[rows.length - 1];
    cursor = orderBy.map((c) => last[c]);
    if (rows.length < pageSize) return;
  }
}

function buildUpsert(table, columns, conflictColumns) {
  const conflict = conflictColumns.split(',').map((c) => c.trim());
  const updateCols = columns.filter((c) => !conflict.includes(c));
  const placeholders = (rowCount) => {
    const values = [];
    const groups = [];
    let i = 1;
    for (let r = 0; r < rowCount; r += 1) {
      const group = [];
      for (let c = 0; c < columns.length; c += 1) group.push(`$${i++}`);
      groups.push(`(${group.join(', ')})`);
    }
    return { values, groups };
  };
  void placeholders;
  return { conflict, updateCols };
}

async function insertChunk(client, table, columns, conflictColumns, rows, preserve = []) {
  if (rows.length === 0) return 0;
  const conflict = conflictColumns.split(',').map((c) => c.trim());
  const updateCols = columns.filter((c) => !conflict.includes(c) && !preserve.includes(c));

  const values = [];
  const groups = [];
  let p = 1;
  for (const row of rows) {
    const group = [];
    for (const column of columns) {
      group.push(`$${p++}`);
      values.push(row[column]);
    }
    groups.push(`(${group.join(', ')})`);
  }

  const conflictSql = `ON CONFLICT (${conflict.join(', ')}) DO UPDATE SET ${updateCols
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(', ')}`;

  const sql = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')})
               VALUES ${groups.join(', ')}
               ${conflictSql}`;
  await client.query(sql, values);
  return rows.length;
}

async function count(client, table) {
  const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM "${table}"`);
  return rows[0]?.n ?? 0;
}

async function collectFindings(source, target) {
  const findings = {};

  // Duplicate row hashes. The target has a UNIQUE index, so these would upsert
  // into one another rather than both landing - worth reporting, not faking.
  if (await tableExists(source, 'leads')) {
    const dup = await source.query(`
      SELECT COUNT(*)::int AS groups, COALESCE(SUM(n - 1), 0)::int AS extra
        FROM (SELECT row_hash, COUNT(*)::int AS n FROM leads GROUP BY row_hash HAVING COUNT(*) > 1) d
    `);
    findings.duplicateRowHashes = dup.rows[0] || { groups: 0, extra: 0 };

    const phones = await source.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE phone_e164 IS NULL)::int AS no_e164,
             COUNT(*) FILTER (WHERE phone_e164 IS NOT NULL)::int AS with_e164
        FROM leads
    `);
    findings.phones = phones.rows[0] || {};

    const status = await source.query(`
      SELECT lead_status, COUNT(*)::int AS n FROM leads GROUP BY lead_status ORDER BY n DESC
    `);
    findings.statuses = status.rows;

    const sources = await source.query(`
      SELECT source_name, COUNT(*)::int AS n
        FROM (SELECT unnest(COALESCE(source_names, '{}')) AS source_name FROM leads) s
       GROUP BY source_name ORDER BY n DESC LIMIT 10
    `);
    findings.sources = sources.rows;
  }

  if (await tableExists(source, 'capture_batch_items')) {
    const orphanItems = await source.query(`
      SELECT COUNT(*)::int AS n
        FROM capture_batch_items bi
       WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.row_hash = bi.row_hash)
    `);
    findings.orphanItems = orphanItems.rows[0]?.n ?? 0;

    const orphanBatches = await source.query(`
      SELECT COUNT(*)::int AS n
        FROM capture_batch_items bi
       WHERE NOT EXISTS (
         SELECT 1 FROM capture_batches cb
          WHERE cb.batch_id = bi.batch_id AND cb.workspace_id = bi.workspace_id
       )
    `);
    findings.orphanBatchRefs = orphanBatches.rows[0]?.n ?? 0;
  }

  findings.targetCounts = {
    leads: (await tableExists(target, 'extractor_leads')) ? await count(target, 'extractor_leads') : 0,
    batches: (await tableExists(target, 'extractor_capture_batches'))
      ? await count(target, 'extractor_capture_batches')
      : 0,
    items: (await tableExists(target, 'extractor_capture_batch_items'))
      ? await count(target, 'extractor_capture_batch_items')
      : 0,
  };

  return findings;
}

function printFindings(findings, sourceCounts) {
  console.log('\nSource rows');
  console.log(`  leads                : ${sourceCounts.leads}`);
  console.log(`  capture_batches      : ${sourceCounts.batches}`);
  console.log(`  capture_batch_items  : ${sourceCounts.items}`);

  console.log('\nQuality checks');
  console.log(`  duplicate row_hash   : ${findings.duplicateRowHashes.extra} extra row(s) in ${findings.duplicateRowHashes.groups} group(s)`);
  console.log(`  leads without E.164  : ${findings.phones.no_e164 || 0} of ${findings.phones.total || 0}`);
  console.log(`  batch items with no lead row : ${findings.orphanItems ?? 'n/a'}`);
  console.log(`  batch items with no batch    : ${findings.orphanBatchRefs ?? 'n/a'}`);

  if (findings.statuses?.length) {
    console.log('\nLead status mix');
    for (const row of findings.statuses) console.log(`  ${row.lead_status}: ${row.n}`);
  }
  if (findings.sources?.length) {
    console.log('\nTop capture sources');
    for (const row of findings.sources) console.log(`  ${row.source_name || '(blank)'}: ${row.n}`);
  }

  console.log('\nTarget rows before import');
  console.log(`  extractor_leads              : ${findings.targetCounts.leads}`);
  console.log(`  extractor_capture_batches    : ${findings.targetCounts.batches}`);
  console.log(`  extractor_capture_batch_items: ${findings.targetCounts.items}`);
}

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL;

  console.log('UCS Extractor import');
  console.log(`  mode   : ${APPLY ? 'APPLY (writes to target)' : 'dry run (no writes)'}`);
  console.log(`  source : ${maskUrl(sourceUrl)}`);
  console.log(`  target : ${maskUrl(targetUrl)}`);

  if (!sourceUrl) {
    console.error('\nSOURCE_DATABASE_URL is not set. Add it to backend/.env (it is gitignored).');
    process.exit(1);
  }
  if (!targetUrl) {
    console.error('\nDATABASE_URL is not set. It should already exist for the backend.');
    process.exit(1);
  }
  if (sameDatabase(sourceUrl, targetUrl)) {
    console.error('\nRefusing to run: source and target are the same database.');
    console.error('Point SOURCE_DATABASE_URL at Supabase (source) and DATABASE_URL at ucs_crm (target).');
    process.exit(1);
  }

  const source = new pg.Client({
    connectionString: sourceUrl,
    ssl: sslOption(sourceUrl, process.env.SOURCE_DATABASE_SSL),
    application_name: 'ucs-crm-extractor-import',
  });
  const target = new pg.Client({
    connectionString: targetUrl,
    ssl: sslOption(targetUrl, process.env.DATABASE_SSL),
    application_name: 'ucs-crm-extractor-import',
  });

  await source.connect();
  await target.connect();

  try {
    // Belt and braces: Postgres itself enforces this for the whole session.
    await source.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
    await source.query('SET statement_timeout = 0');

    await assertExtractorSource(source);

    for (const table of ['extractor_leads', 'extractor_capture_batches', 'extractor_capture_batch_items']) {
      if (!(await tableExists(target, table))) {
        console.error(`\nTarget table ${table} is missing. Start the backend once so ensureExtractorSchema runs.`);
        process.exit(1);
      }
    }

    const sourceHas = {
      leads: await tableExists(source, 'leads'),
      batches: await tableExists(source, 'capture_batches'),
      items: await tableExists(source, 'capture_batch_items'),
    };
    console.log('\nSource tables present');
    console.log(`  leads: ${sourceHas.leads}`);
    console.log(`  capture_batches: ${sourceHas.batches}`);
    console.log(`  capture_batch_items: ${sourceHas.items}`);

    const sourceCounts = {
      leads: sourceHas.leads ? await count(source, 'leads') : 0,
      batches: sourceHas.batches ? await count(source, 'capture_batches') : 0,
      items: sourceHas.items ? await count(source, 'capture_batch_items') : 0,
    };

    const findings = await collectFindings(source, target);
    printFindings(findings, sourceCounts);

    if (!APPLY) {
      console.log('\nDry run complete. Nothing was written.');
      console.log('Re-run with --apply to copy the rows (target tables are backed up first).');
      return;
    }

    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    console.log(`\nBacking up target tables as *_backup_${stamp} ...`);
    for (const table of ['extractor_leads', 'extractor_capture_batches', 'extractor_capture_batch_items']) {
      await target.query(
        `CREATE TABLE IF NOT EXISTS "${table}_backup_${stamp}" AS SELECT * FROM "${table}"`,
      );
    }

    let imported = { leads: 0, batches: 0, items: 0 };
    await target.query('BEGIN');
    try {
      if (sourceHas.batches) {
        const sourceCols = await commonColumns(source, 'capture_batches', BATCH_COLUMNS);
        const targetCols = await commonColumns(target, 'extractor_capture_batches', BATCH_COLUMNS);
        const columns = sourceCols.filter((c) => targetCols.includes(c));
        console.log(`\nImporting capture_batches (${columns.length} columns) ...`);
        for await (const page of readRows(source, 'capture_batches', columns, ['id'])) {
          imported.batches += await insertChunk(
            target, 'extractor_capture_batches', columns, BATCH_CONFLICT, page,
          );
          process.stdout.write(`\r  capture_batches: ${imported.batches}`);
        }
        process.stdout.write('\n');
      }

      if (sourceHas.leads) {
        const sourceCols = await commonColumns(source, 'leads', LEAD_COLUMNS);
        const targetCols = await commonColumns(target, 'extractor_leads', LEAD_COLUMNS);
        const columns = sourceCols.filter((c) => targetCols.includes(c));
        console.log(`\nImporting leads (${columns.length} columns) ...`);
        for await (const page of readRows(source, 'leads', columns, ['id'])) {
          imported.leads += await insertChunk(
            target, 'extractor_leads', columns, LEAD_CONFLICT, page, LEAD_PRESERVE_ON_CONFLICT,
          );
          process.stdout.write(`\r  leads: ${imported.leads}`);
        }
        process.stdout.write('\n');
      }

      if (sourceHas.items) {
        const sourceCols = await commonColumns(source, 'capture_batch_items', ITEM_COLUMNS);
        const targetCols = await commonColumns(
          target, 'extractor_capture_batch_items', ITEM_COLUMNS,
        );
        const columns = sourceCols.filter((c) => targetCols.includes(c));
        console.log(`\nImporting capture_batch_items (${columns.length} columns) ...`);
        for await (const page of readRows(source, 'capture_batch_items', columns, ['batch_id', 'row_hash'])) {
          imported.items += await insertChunk(
            target, 'extractor_capture_batch_items', columns, ITEM_CONFLICT, page,
          );
          process.stdout.write(`\r  capture_batch_items: ${imported.items}`);
        }
        process.stdout.write('\n');
      }

      await target.query('COMMIT');
    } catch (err) {
      await target.query('ROLLBACK');
      console.error('\nImport failed, transaction rolled back:', err.message);
      process.exit(1);
    }

    console.log('\nImported rows');
    console.log(`  leads               : ${imported.leads}`);
    console.log(`  capture_batches     : ${imported.batches}`);
    console.log(`  capture_batch_items : ${imported.items}`);

    console.log('\nTarget rows after import');
    console.log(`  extractor_leads              : ${await count(target, 'extractor_leads')}`);
    console.log(`  extractor_capture_batches    : ${await count(target, 'extractor_capture_batches')}`);
    console.log(`  extractor_capture_batch_items: ${await count(target, 'extractor_capture_batch_items')}`);

    if (findings.duplicateRowHashes.extra > 0) {
      console.log(
        `\nNote: ${findings.duplicateRowHashes.extra} duplicate row(s) in the source were merged onto the same row_hash by the upsert.`,
      );
    }
    console.log(`\nBackups kept as extractor_*_backup_${stamp} in the target database.`);
  } finally {
    await source.end().catch(() => {});
    await target.end().catch(() => {});
  }
}

// A readable path when run from the repo root or from backend/.
main().catch((err) => {
  console.error('\nImport failed:', err.message);
  process.exit(1);
});
