// Resets the TEST database (ucs_test) to a fresh, empty schema so app testing
// can start from zero: drops every table / view / materialised view / sequence
// in ucs_test.public, then re-runs the same bootstrap the server runs on boot
// (scripts/setup-test-db.mjs).
//
// Run from backend/:  npm run test:db:reset
//
// Safety: refuses to run unless TEST_DATABASE_URL points at /ucs_test — the
// live database is never reachable from this script. Extensions (pgcrypto,
// uuid-ossp, …) live outside the dropped objects and are deliberately kept,
// since re-CREATE EXTENSION needs privileges the app role does not have.
import { config as dotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { viaTunnelIfUp } from './lib/tunnel-url.mjs';

const BACKEND_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv({ path: path.join(BACKEND_DIR, '.env') });

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error('[test:reset] TEST_DATABASE_URL is not set in backend/.env — refusing to run.');
  process.exit(1);
}
if (new URL(testUrl).pathname !== '/ucs_test') {
  console.error(`[test:reset] TEST_DATABASE_URL must point at /ucs_test, got "${new URL(testUrl).pathname}" — refusing to run.`);
  process.exit(1);
}

const client = new pg.Client({
  connectionString: await viaTunnelIfUp(testUrl),
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  const { rows } = await client.query('SELECT current_database() AS db');
  if (rows[0].db !== 'ucs_test') {
    console.error(`[test:reset] connected to "${rows[0].db}" instead of ucs_test — refusing to drop anything.`);
    process.exit(1);
  }

  const plan = [
    ['tables', `SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public'`],
    ['views', `SELECT viewname AS name FROM pg_views WHERE schemaname = 'public'`],
    ['matviews', `SELECT matviewname AS name FROM pg_matviews WHERE schemaname = 'public'`],
    ['sequences', `SELECT sequencename AS name FROM pg_sequences WHERE schemaname = 'public'`],
  ];

  let dropped = 0;
  const failed = [];
  for (const [label, sql] of plan) {
    const { rows: objs } = await client.query(sql);
    const keyword = label === 'matviews' ? 'MATERIALIZED VIEW' : label.slice(0, -1).toUpperCase();
    for (const o of objs) {
      try {
        await client.query(`DROP ${keyword} IF EXISTS public."${o.name.replace(/"/g, '""')}" CASCADE`);
        dropped += 1;
      } catch (err) {
        failed.push(`${o.name}: ${err.message}`);
      }
    }
    if (objs.length) console.log(`[test:reset] dropped ${objs.length} ${label}`);
  }
  if (failed.length) {
    console.error(`[test:reset] ${failed.length} object(s) could not be dropped:`);
    for (const f of failed) console.error('  - ' + f);
  }

  const { rows: left } = await client.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'");
  console.log(`[test:reset] ${dropped} objects dropped, ${left[0].n} tables remain in ucs_test.public`);
} finally {
  await client.end();
}

console.log('[test:reset] re-running schema bootstrap…');
const child = spawn(process.execPath, ['scripts/setup-test-db.mjs'], { cwd: BACKEND_DIR, env: process.env, stdio: 'inherit' });
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
