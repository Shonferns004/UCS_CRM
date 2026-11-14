-- UCS Extractor module - initial schema in the ucs_crm database.
--
-- Mirrors the standalone extractor's Postgres schema column-for-column (plus
-- category_label) so a later clone from Supabase is a straight INSERT...SELECT
-- with no mapping. All objects are prefixed extractor_ so they cannot collide
-- with CRM tables (leads, business_finder_*, ...).
--
-- The backend also runs backend/src/bootstrap/ensureExtractorSchema.js on every
-- boot, so this file is for reviewers and for anyone applying migrations by
-- hand. Both are idempotent.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS extractor_leads (
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
);

CREATE TABLE IF NOT EXISTS extractor_capture_batches (
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
);

CREATE TABLE IF NOT EXISTS extractor_capture_batch_items (
  batch_id      TEXT NOT NULL,
  row_hash      TEXT NOT NULL,
  workspace_id  TEXT NOT NULL DEFAULT 'default',
  row_index     INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (batch_id, row_hash)
);

CREATE UNIQUE INDEX IF NOT EXISTS extractor_leads_row_hash_idx
  ON extractor_leads (row_hash);
CREATE INDEX IF NOT EXISTS extractor_leads_workspace_created_idx
  ON extractor_leads (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS extractor_leads_captured_idx
  ON extractor_leads (captured_at DESC);
CREATE INDEX IF NOT EXISTS extractor_leads_phone_idx
  ON extractor_leads (phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS extractor_leads_region_idx
  ON extractor_leads (phone_region_state) WHERE phone_region_state IS NOT NULL;
CREATE INDEX IF NOT EXISTS extractor_leads_status_idx
  ON extractor_leads (workspace_id, lead_status);
CREATE INDEX IF NOT EXISTS extractor_leads_name_idx
  ON extractor_leads (lower(display_name));
CREATE INDEX IF NOT EXISTS extractor_leads_ai_status_idx
  ON extractor_leads (workspace_id, ai_status, created_at);
CREATE INDEX IF NOT EXISTS extractor_leads_email_status_idx
  ON extractor_leads (workspace_id, email_status) WHERE email IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS extractor_capture_batches_unique_idx
  ON extractor_capture_batches (batch_id, workspace_id);
CREATE INDEX IF NOT EXISTS extractor_capture_batches_session_idx
  ON extractor_capture_batches (session_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS extractor_capture_batches_created_idx
  ON extractor_capture_batches (created_at DESC);

CREATE INDEX IF NOT EXISTS extractor_capture_batch_items_row_idx
  ON extractor_capture_batch_items (row_hash, batch_id);
CREATE INDEX IF NOT EXISTS extractor_capture_batch_items_workspace_idx
  ON extractor_capture_batch_items (workspace_id, batch_id);
