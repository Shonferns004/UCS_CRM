import db from '../config/db.js';

/**
 * Schema for the UCS Extractor module, created in the `ucs_crm` database.
 *
 * Shape mirrors the standalone extractor's Postgres schema column-for-column
 * (plus `category_label`), so a later clone from Supabase is a straight
 * `INSERT ... SELECT` with no mapping. Everything is prefixed `extractor_` so
 * it cannot collide with CRM tables (`leads`, `business_finder_*`, ...).
 *
 * Every statement is idempotent. This runs on every boot, and a failure is
 * logged by the caller instead of stopping the server.
 */

async function ensureExtension() {
  // gen_random_uuid() is built into PG13+, but the reference schema used
  // pgcrypto. Creating it is harmless; a role without CREATE EXTENSION rights
  // still boots, because PG13+ has the function anyway.
  try {
    await db._pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  } catch (err) {
    console.warn('extractor: pgcrypto extension unavailable:', err?.message || err);
  }
}

async function ensureTables() {
  await db._pool.query(`CREATE TABLE IF NOT EXISTS extractor_leads (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          TEXT NOT NULL DEFAULT 'default',
    entity_type           TEXT NOT NULL DEFAULT 'local_business',
    display_name          TEXT NOT NULL,
    category              TEXT,
    category_label        TEXT,
    address               TEXT,
    phone_e164            TEXT,
    phone_raw             TEXT,
    phone_region_state    TEXT,
    phone_region_city     TEXT,
    phone_region_source   TEXT,
    phone_line_type       TEXT,
    website               TEXT,
    email                 TEXT,
    cin                   TEXT,
    source_names          TEXT[] NOT NULL DEFAULT '{}',
    source_url            TEXT,
    captured_at           TIMESTAMPTZ,
    verification_status   TEXT NOT NULL DEFAULT 'unverified',
    lead_status           TEXT NOT NULL DEFAULT 'new',
    owner_name            TEXT,
    tags                  TEXT[] NOT NULL DEFAULT '{}',
    last_fetched_at       TIMESTAMPTZ,
    ai_tags               TEXT[] NOT NULL DEFAULT '{}',
    ai_score              INTEGER,
    ai_reason             TEXT,
    ai_status             TEXT NOT NULL DEFAULT 'pending',
    ai_model              TEXT,
    ai_processed_at       TIMESTAMPTZ,
    ai_attempts           INTEGER NOT NULL DEFAULT 0,
    email_status          TEXT NOT NULL DEFAULT 'pending',
    email_checked_at      TIMESTAMPTZ,
    email_attempts        INTEGER NOT NULL DEFAULT 0,
    email_reason          TEXT,
    row_hash              TEXT NOT NULL,
    first_batch_id        TEXT,
    last_batch_id         TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await db._pool.query(`CREATE TABLE IF NOT EXISTS extractor_capture_batches (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id      TEXT NOT NULL,
    session_id    TEXT NOT NULL DEFAULT 'import',
    workspace_id  TEXT NOT NULL DEFAULT 'default',
    source_name   TEXT NOT NULL DEFAULT 'Capture',
    source_url    TEXT NOT NULL DEFAULT '',
    captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    row_count     INTEGER NOT NULL DEFAULT 0,
    accepted      INTEGER NOT NULL DEFAULT 0,
    updated       INTEGER NOT NULL DEFAULT 0,
    duplicates    INTEGER NOT NULL DEFAULT 0,
    rejected      INTEGER NOT NULL DEFAULT 0,
    user_id       TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  // Exact batch membership. Keyed by (batch_id, row_hash) exactly like the
  // source schema, so a lead that is re-captured later still belongs to every
  // batch it was seen in.
  await db._pool.query(`CREATE TABLE IF NOT EXISTS extractor_capture_batch_items (
    batch_id      TEXT NOT NULL,
    row_hash      TEXT NOT NULL,
    workspace_id  TEXT NOT NULL DEFAULT 'default',
    row_index     INTEGER,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (batch_id, row_hash)
  )`);

  // The only vocabulary the AI tagger is allowed to use. The panel filters by
  // these exact strings, so the model can never invent a tag nobody can find.
  await db._pool.query(`CREATE TABLE IF NOT EXISTS extractor_ai_keywords (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  TEXT NOT NULL DEFAULT 'default',
    keyword       TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

/**
 * Columns that may be missing on a database where an earlier version of this
 * module created the table. ADD COLUMN IF NOT EXISTS makes the repair safe to
 * run on every boot.
 */
const LEAD_COLUMNS = [
  ['workspace_id', "TEXT NOT NULL DEFAULT 'default'"],
  ['entity_type', "TEXT NOT NULL DEFAULT 'local_business'"],
  ['category_label', 'TEXT'],
  ['phone_region_source', 'TEXT'],
  ['cin', 'TEXT'],
  ['source_names', "TEXT[] NOT NULL DEFAULT '{}'"],
  ['captured_at', 'TIMESTAMPTZ'],
  ['owner_name', 'TEXT'],
  ['tags', "TEXT[] NOT NULL DEFAULT '{}'"],
  ['last_fetched_at', 'TIMESTAMPTZ'],
  ['ai_tags', "TEXT[] NOT NULL DEFAULT '{}'"],
  ['ai_score', 'INTEGER'],
  ['ai_reason', 'TEXT'],
  ['ai_status', "TEXT NOT NULL DEFAULT 'pending'"],
  ['ai_model', 'TEXT'],
  ['ai_processed_at', 'TIMESTAMPTZ'],
  ['ai_attempts', 'INTEGER NOT NULL DEFAULT 0'],
  ['email_status', "TEXT NOT NULL DEFAULT 'pending'"],
  ['email_checked_at', 'TIMESTAMPTZ'],
  ['email_attempts', 'INTEGER NOT NULL DEFAULT 0'],
  ['email_reason', 'TEXT'],
  ['updated_at', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()'],
];

async function ensureColumns() {
  for (const [name, type] of LEAD_COLUMNS) {
    await db._pool.query(`ALTER TABLE extractor_leads ADD COLUMN IF NOT EXISTS ${name} ${type}`);
  }
  await db._pool.query(
    `ALTER TABLE extractor_capture_batches ADD COLUMN IF NOT EXISTS user_id TEXT`,
  );
}

async function ensureIndexes() {
  // The upsert key. A unique index rather than a constraint so an import from
  // a source that already has the same rows can be re-run safely.
  await db._pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS extractor_leads_row_hash_idx
      ON extractor_leads (row_hash)
  `);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS extractor_leads_workspace_created_idx
      ON extractor_leads (workspace_id, created_at DESC)
  `);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS extractor_leads_captured_idx
      ON extractor_leads (captured_at DESC)
  `);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS extractor_leads_phone_idx
      ON extractor_leads (phone_e164) WHERE phone_e164 IS NOT NULL
  `);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS extractor_leads_region_idx
      ON extractor_leads (phone_region_state) WHERE phone_region_state IS NOT NULL
  `);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS extractor_leads_status_idx
      ON extractor_leads (workspace_id, lead_status)
  `);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS extractor_leads_name_idx
      ON extractor_leads (lower(display_name))
  `);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS extractor_leads_ai_status_idx
      ON extractor_leads (workspace_id, ai_status, created_at)
  `);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS extractor_leads_email_status_idx
      ON extractor_leads (workspace_id, email_status) WHERE email IS NULL
  `);

  await db._pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS extractor_capture_batches_unique_idx
      ON extractor_capture_batches (batch_id, workspace_id)
  `);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS extractor_capture_batches_session_idx
      ON extractor_capture_batches (session_id, captured_at DESC)
  `);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS extractor_capture_batches_created_idx
      ON extractor_capture_batches (created_at DESC)
  `);

  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS extractor_capture_batch_items_row_idx
      ON extractor_capture_batch_items (row_hash, batch_id)
  `);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS extractor_capture_batch_items_workspace_idx
      ON extractor_capture_batch_items (workspace_id, batch_id)
  `);

  await db._pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS extractor_ai_keywords_unique_idx
      ON extractor_ai_keywords (workspace_id, lower(keyword))
  `);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS extractor_ai_keywords_workspace_idx
      ON extractor_ai_keywords (workspace_id, created_at)
  `);
}

export const ensureExtractorSchema = async () => {
  await ensureExtension();
  await ensureTables();
  await ensureColumns();
  await ensureIndexes();
};
