-- =============================================================================
-- UCS CRM + OpenWA — server database bootstrap
-- Target: ucs_crm on the server (e.g. 192.168.1.100:5432), as a role allowed to
-- create schemas/tables (postgres).
--
-- WHY THIS FILE EXISTS
--   The gateway boots with POSTGRES_SCHEMA=openwa and runs its TypeORM migrations
--   *inside* that schema. PostgreSQL does not create schemas on demand, so a
--   missing `openwa` fails the boot with:
--       QueryFailedError: schema "openwa" does not exist
--   Creating the schema is all the gateway needs — its own migrations then build
--   sessions, messages, audit_logs and the rest on the next start.
--
--   The CRM tables below are created by the backend at boot too (ensure*Schema).
--   They are repeated here so a fresh server can be prepared before that restart.
--
-- SAFE TO RE-RUN: every statement is IF NOT EXISTS / IF EXISTS.
-- =============================================================================

-- 1) The gateway's schema ------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS openwa AUTHORIZATION postgres;

-- Only needed when the gateway connects as a role other than the schema owner:
-- GRANT USAGE, CREATE ON SCHEMA openwa TO <gateway_role>;


-- 2) CRM tables used by the WhatsApp panel -------------------------------------

-- 2a) Which NGO/station a gateway session belongs to (one session may serve
--     several stations, so session_id must NOT be unique).
CREATE TABLE IF NOT EXISTS whatsapp_session_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  session_name text,
  ngo_id uuid NOT NULL REFERENCES ngos(id) ON DELETE CASCADE,
  station text,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Earlier deployments made session_id unique; drop that so a session can be
-- shared with several stations.
ALTER TABLE whatsapp_session_assignments
  DROP CONSTRAINT IF EXISTS whatsapp_session_assignments_session_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wsa_session_ngo_station
  ON whatsapp_session_assignments (session_id, ngo_id, station);


-- 2b) Who deleted which WhatsApp message. The gateway only keeps an empty
--     `revoked` row, so the actor, station and original body live CRM-side.
CREATE TABLE IF NOT EXISTS whatsapp_message_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  session_name text,
  ngo_id uuid,
  ngo_name text,
  station text,
  chat_id text,
  chat_name text,
  wa_message_id text,
  message_body text,
  message_type text,
  actor_id uuid,
  actor_name text,
  actor_role text,
  for_everyone boolean NOT NULL DEFAULT true,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_message_deletions
  ADD COLUMN IF NOT EXISTS message_direction text;

CREATE INDEX IF NOT EXISTS idx_wmd_session_deleted
  ON whatsapp_message_deletions (session_id, deleted_at DESC);

-- One row per deleted message, whatever landed it (gateway passthrough and the
-- explicit client call both record, in either order).
-- If this fails with "could not create unique index", duplicate rows already
-- exist; remove the extras first:
--   DELETE FROM whatsapp_message_deletions a
--    USING whatsapp_message_deletions b
--    WHERE a.ctid < b.ctid
--      AND a.session_id = b.session_id
--      AND a.wa_message_id = b.wa_message_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_wmd_session_message
  ON whatsapp_message_deletions (session_id, wa_message_id);


-- 2c) Smart-reply knowledge base: approved question → answer. The chat page
--     drafts a reply from a match; nothing is sent without a person pressing Send.
CREATE TABLE IF NOT EXISTS whatsapp_reply_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  keywords text,
  ngo_id uuid REFERENCES ngos(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wrt_enabled ON whatsapp_reply_templates (enabled);
CREATE INDEX IF NOT EXISTS idx_wrt_ngo ON whatsapp_reply_templates (ngo_id);


-- 3) Verify --------------------------------------------------------------------
SELECT schema_name
  FROM information_schema.schemata
 WHERE schema_name = 'openwa';

SELECT table_schema, table_name
  FROM information_schema.tables
 WHERE table_name IN (
         'whatsapp_session_assignments',
         'whatsapp_message_deletions',
         'whatsapp_reply_templates'
       )
 ORDER BY table_schema, table_name;
