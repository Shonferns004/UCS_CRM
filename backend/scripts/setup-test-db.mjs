// Builds the schema of the `ucs_test` database by running the same idempotent
// bootstrap (ensure*) functions the server runs on boot.
//
// Run from backend/:  npm run test:db:setup     (after `npm run db:create-test`)
//
// Safety: DATABASE_URL is forced to TEST_DATABASE_URL before src/config/db.js
// is first imported (dotenv never overwrites an already-set variable), and the
// connection is verified to be ucs_test before any DDL runs. The live database
// is never touched.
import { config as dotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { viaTunnelIfUp } from './lib/tunnel-url.mjs';

const BACKEND_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv({ path: path.join(BACKEND_DIR, '.env') });

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error('[test:setup] TEST_DATABASE_URL is not set in backend/.env.');
  process.exit(1);
}
if (new URL(testUrl).pathname !== '/ucs_test') {
  console.error(`[test:setup] TEST_DATABASE_URL must point at /ucs_test, got "${new URL(testUrl).pathname}" — fix backend/.env first.`);
  process.exit(1);
}

// Host rewrite for blocked networks: when the SSH tunnel is up the pool has to
// dial 127.0.0.1 instead of the RDS IP (same as the diag scripts).
process.env.DATABASE_URL = await viaTunnelIfUp(testUrl);
process.env.READ_DATABASE_URL = '';

const { default: db } = await import('../src/config/db.js');

const { rows: who } = await db._pool.query('SELECT current_database() AS db');
if (who[0].db !== 'ucs_test') {
  console.error(`[test:setup] connected to "${who[0].db}" instead of ucs_test — refusing to run DDL.`);
  process.exit(1);
}
console.log(`[test:setup] connected to ${who[0].db}, applying schema…`);

// Same functions, same order as the server boot sequence in src/index.js.
const bootstrapSteps = [
  'ensureEventHeadSchema',
  'ensureTicketSchema',
  'ensureBugsSchema',
  'ensureLoanDeductionSchema',
  'ensureSpecialIncentiveSchema',
  'ensureSalaryHoldSchema',
  'ensureHistoricalImportSchema',
  'ensureAbsenceProofSchema',
  'ensureCertificateSchema',
  'ensureNoticeSchema',
  'ensureFroLiveStatusSchema',
  'ensureHighTierProvenanceSchema',
  'ensureHighTierCollectionSnapshot',
  'ensureMeetingSchema',
  'ensureAuthSessionSchema',
  'ensureBeneficiarySchema',
  'ensureOperatorSchema',
  'ensureVotingSchema',
  'ensureAudienceVotingSchema',
  'ensureReminderPushSchema',
  'ensureReminderPaymentSchema',
  'ensureChatSchema',
  'ensureSimInventorySchema',
  'ensureSignatureSchema',
  'ensureDocumentsSchema',
  'ensureLeadsRecruiterFkSchema',
  'ensureSevakRenewalSchema',
  'ensureSevakSignatureSchema',
  'ensureFroDonorLogOperatorSchema',
  'ensureTaskAssignmentSchema',
  'ensureAssetSchema',
  'ensureEventHeadPlannerEventLinkSchema',
  'ensureDashboardIndexes',
  'ensureTemporaryDataAccessSchema',
];

const failed = [];
for (const name of bootstrapSteps) {
  try {
    const mod = await import(`../src/bootstrap/${name}.js`);
    const fn = mod[name] || mod.default;
    if (typeof fn !== 'function') throw new Error(`no export named ${name}`);
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed.push(name);
    console.error(`  FAIL ${name}: ${err?.message || err}`);
  }
}

const { rows: tables } = await db._pool.query(
  "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'"
);
console.log(`[test:setup] ${tables[0].n} tables in ucs_test.public`);

await db._pool.end();

if (failed.length > 0) {
  console.error(`[test:setup] ${failed.length} step(s) failed: ${failed.join(', ')}`);
  process.exit(1);
}
console.log('[test:setup] done — run `npm test`.');
