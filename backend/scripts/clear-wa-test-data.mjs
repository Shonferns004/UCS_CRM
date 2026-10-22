// Deletes WhatsApp TEST data (messages, conversations, contacts, and the
// webhook log) from the TEST database so a tester can start from a clean
// inbox — WITHOUT dropping the whole schema (reset-test-db.mjs does that).
//
// Run from backend/:  node scripts/clear-wa-test-data.mjs --yes
//
// Safety: refuses to run unless TEST_DATABASE_URL points at /ucs_test and the
// live database is never reachable from this script, so production data can
// not be touched by accident. Without --yes it only prints the row counts.
import { config as dotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { viaTunnelIfUp } from './lib/tunnel-url.mjs';

const BACKEND_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv({ path: path.join(BACKEND_DIR, '.env') });

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error('[wa:clear] TEST_DATABASE_URL is not set in backend/.env — refusing to run.');
  process.exit(1);
}
if (new URL(testUrl).pathname !== '/ucs_test') {
  console.error(`[wa:clear] TEST_DATABASE_URL must point at /ucs_test, got "${new URL(testUrl).pathname}" — refusing to run.`);
  process.exit(1);
}

const confirm = process.argv.includes('--yes');

// Child-first order so foreign keys never block the delete.
const TABLES = ['messages', 'conversations', 'contacts', 'whatsapp_webhook_logs'];

const client = new pg.Client({
  connectionString: await viaTunnelIfUp(testUrl),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

try {
  const { rows } = await client.query('SELECT current_database() AS db');
  if (rows[0].db !== 'ucs_test') {
    console.error(`[wa:clear] connected to "${rows[0].db}" instead of ucs_test — refusing to delete anything.`);
    process.exit(1);
  }

  // Only touch tables that actually exist in this database.
  const { rows: present } = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)",
    [TABLES],
  );
  const existing = TABLES.filter((t) => present.some((p) => p.tablename === t));

  if (existing.length === 0) {
    console.log('[wa:clear] none of the WhatsApp tables exist here — nothing to do.');
    process.exit(0);
  }

  console.log('[wa:clear] current row counts:');
  for (const t of existing) {
    const { rows: c } = await client.query(`SELECT count(*)::int AS n FROM public."${t}"`);
    console.log(`  ${t.padEnd(24)} ${c[0].n}`);
  }

  if (!confirm) {
    console.log('\n[wa:clear] dry run — re-run with --yes to delete these rows.');
    process.exit(0);
  }

  await client.query('BEGIN');
  for (const t of existing) {
    const { rowCount } = await client.query(`DELETE FROM public."${t}"`);
    console.log(`  deleted ${rowCount} row(s) from ${t}`);
  }
  await client.query('COMMIT');
  console.log('[wa:clear] done. WhatsApp test data cleared from ucs_test.');
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('[wa:clear] failed:', err?.message || err);
  process.exitCode = 1;
} finally {
  await client.end();
}
