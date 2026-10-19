// Creates the dedicated `ucs_test` database on the RDS instance. Idempotent.
//
// Run from backend/:  npm run db:create-test
//
// Existence is checked with the app role (ucs_app), so a healthy setup never
// needs an admin role: if ucs_test is already there — the usual case — the
// script exits without touching anything. ADMIN_DATABASE_URL (a role with
// CREATEDB, e.g. ucs_admin) is only required when the database actually has to
// be created, and no data is read from or written to any existing database.
import { config as dotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { viaTunnelIfUp } from './lib/tunnel-url.mjs';

const BACKEND_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv({ path: path.join(BACKEND_DIR, '.env') });

const TEST_DB = 'ucs_test';
const ssl = process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false;

// Refuse to run if .env and this script disagree about the test DB name, so a
// half-edited TEST_DATABASE_URL can never point the suite at the live database.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error('[create-test] TEST_DATABASE_URL is not set in backend/.env.');
  process.exit(1);
}
const testPath = new URL(testUrl).pathname.replace(/^\//, '');
if (testPath !== TEST_DB) {
  console.error(`[create-test] TEST_DATABASE_URL points at "${testPath}", expected "${TEST_DB}" — fix backend/.env first.`);
  process.exit(1);
}

// Connecting as ucs_app is the existence check: 3D000 = database missing.
let exists = false;
const probe = new pg.Client({ connectionString: await viaTunnelIfUp(testUrl), ssl });
try {
  await probe.connect();
  exists = true;
} catch (err) {
  if (err?.code !== '3D000') {
    console.error(`[create-test] could not connect to ${TEST_DB} as ucs_app: ${err?.message || err}`);
    console.error('Fix TEST_DATABASE_URL / credentials in backend/.env before creating anything.');
    process.exit(1);
  }
} finally {
  await probe.end().catch(() => {});
}

if (exists) {
  console.log(`[create-test] ${TEST_DB} already exists — nothing to do.`);
} else {
  const adminUrl = process.env.ADMIN_DATABASE_URL;
  if (!adminUrl) {
    console.error(`[create-test] ${TEST_DB} does not exist and ADMIN_DATABASE_URL is not set in backend/.env.`);
    console.error('Uncomment it (role with CREATEDB, e.g. ucs_admin — verify the password first) and re-run.');
    process.exit(1);
  }

  const admin = new pg.Client({ connectionString: await viaTunnelIfUp(adminUrl), ssl });
  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE ${TEST_DB} OWNER ucs_app`);
    console.log(`[create-test] created ${TEST_DB} (owner: ucs_app)`);
  } catch (err) {
    console.error('[create-test] failed:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await admin.end().catch(() => {});
  }

  if (process.exitCode !== 1) {
    // Belt and braces: on PostgreSQL 15+ the public schema belongs to the
    // database owner, on older versions PUBLIC already has CREATE. The explicit
    // grant makes ucs_app's rights the same either way.
    const onTest = new pg.Client({ connectionString: await viaTunnelIfUp(testUrl), ssl });
    try {
      await onTest.connect();
      await onTest.query('GRANT ALL ON SCHEMA public TO ucs_app');
      await onTest.query(`GRANT CREATE, CONNECT ON DATABASE ${TEST_DB} TO ucs_app`);
      console.log('[create-test] granted ucs_app rights — ready for `npm run test:db:setup`.');
    } catch (err) {
      console.error('[create-test] grant failed:', err?.message || err);
      process.exitCode = 1;
    } finally {
      await onTest.end().catch(() => {});
    }
  }
}
