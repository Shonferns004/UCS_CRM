import db from '../config/db.js';

async function ensureTables() {
  await db._pool.query(`CREATE TABLE IF NOT EXISTS business_finder_leads (
    id          SERIAL PRIMARY KEY,
    name        TEXT,
    category    TEXT,
    phone       TEXT,
    address     TEXT,
    website     TEXT,
    status      TEXT,
    source      TEXT,
    keyword     TEXT,
    location    TEXT,
    lat         DOUBLE PRECISION,
    lng         DOUBLE PRECISION,
    user_id     TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`);

  // One row per Google Maps search run. The same business can appear in several
  // searches, so batches reference leads through business_finder_batch_items
  // instead of owning a single batch_id. That keeps each search's full result
  // list intact without duplicating the lead itself.
  await db._pool.query(`CREATE TABLE IF NOT EXISTS business_finder_batches (
    id          TEXT PRIMARY KEY,
    keyword     TEXT,
    location    TEXT,
    source      TEXT,
    total       INTEGER DEFAULT 0,
    user_id     TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`);
  await db._pool.query(`CREATE TABLE IF NOT EXISTS business_finder_batch_items (
    batch_id    TEXT REFERENCES business_finder_batches(id) ON DELETE CASCADE,
    lead_id     INTEGER REFERENCES business_finder_leads(id) ON DELETE CASCADE,
    position    INTEGER DEFAULT 0,
    PRIMARY KEY (batch_id, lead_id)
  )`);
}

// Columns added after the first version of Business Finder shipped. Each one is
// optional: ADD COLUMN IF NOT EXISTS keeps this safe to run on every boot.
const EXTRA_COLUMNS = [
  ['rating', 'DOUBLE PRECISION'],
  ['reviews', 'INTEGER'],
  ['place_url', 'TEXT'],
  ['plus_code', 'TEXT'],
  ['hours', 'TEXT'],
  ['email', 'TEXT'],
  ['dedupe_key', 'TEXT'],
  ['updated_at', 'TIMESTAMPTZ DEFAULT NOW()'],
];

async function ensureColumns() {
  for (const [name, type] of EXTRA_COLUMNS) {
    await db._pool.query(`ALTER TABLE business_finder_leads ADD COLUMN IF NOT EXISTS ${name} ${type}`);
  }
  await db._pool.query(`ALTER TABLE business_finder_leads ALTER COLUMN user_id TYPE TEXT USING user_id::text`);
  await db._pool.query(`ALTER TABLE business_finder_batches ALTER COLUMN user_id TYPE TEXT USING user_id::text`);
}

// Google Maps returns the same shop again on every scroll and on every repeat
// search, so the collector used to fill the table with duplicates. A stable
// hash of name + phone (or address when there is no phone) lets collect upsert
// instead of insert. Existing rows are backfilled first, duplicates are pruned,
// and only then is the unique index created.
async function ensureDedupeIndex() {
  await db._pool.query(`
    UPDATE business_finder_leads
       SET dedupe_key = md5(lower(coalesce(name, '')) || '|' || lower(coalesce(nullif(phone, ''), address, '')))
     WHERE dedupe_key IS NULL AND name IS NOT NULL
  `);
  await db._pool.query(`
    DELETE FROM business_finder_leads a
     USING business_finder_leads b
     WHERE a.id > b.id
       AND a.dedupe_key IS NOT NULL
       AND a.dedupe_key = b.dedupe_key
  `);
  await db._pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS business_finder_leads_dedupe_key_idx
      ON business_finder_leads (dedupe_key)
  `);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS business_finder_leads_created_at_idx
      ON business_finder_leads (created_at DESC)
  `);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS business_finder_batches_created_at_idx
      ON business_finder_batches (created_at DESC)
  `);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS business_finder_batch_items_lead_idx
      ON business_finder_batch_items (lead_id)
  `);
}

export const ensureBusinessFinderSchema = async () => {
  await ensureTables();
  await ensureColumns();
  await ensureDedupeIndex();
};
