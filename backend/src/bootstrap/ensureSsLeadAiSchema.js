import db from '../config/db.js';

// AI scoring cache for the SS reply inbox. One row per lead, written once when
// the reply is scored and reused by every list request afterwards.
// Idempotent: re-applied on every boot.
export async function ensureSsLeadAiSchema() {
  await db._pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_label text`);
  await db._pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_score integer`);
  await db._pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_reason text`);
  await db._pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_model text`);
  await db._pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_version text`);
  await db._pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_at timestamptz`);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS idx_leads_ss_ai_pending
      ON leads (created_at DESC)
      WHERE source = 'WhatsApp Bulk Reply' AND ai_at IS NULL
  `);
}
