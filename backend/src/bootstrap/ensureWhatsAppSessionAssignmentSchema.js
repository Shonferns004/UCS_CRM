import db from '../config/db.js';

// Maps an OpenWA gateway session to a CRM NGO + FRO station. The gateway owns the
// session itself; this table is the CRM-side assignment used to decide which FRO
// may see that session's chats. Idempotent, re-applied on every boot.
export async function ensureWhatsAppSessionAssignmentSchema() {
  await db._pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_session_assignments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id text NOT NULL UNIQUE,
      session_name text,
      ngo_id uuid NOT NULL REFERENCES ngos(id) ON DELETE CASCADE,
      station text,
      assigned_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  // One session may be shared with several stations, so session_id is no longer
  // unique. Re-running this drops the old single-assignment constraint and adds
  // the (session, NGO, station) uniqueness instead.
  await db._pool.query(`
    ALTER TABLE whatsapp_session_assignments
      DROP CONSTRAINT IF EXISTS whatsapp_session_assignments_session_id_key
  `);
  await db._pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_wsa_session_ngo_station
      ON whatsapp_session_assignments (session_id, ngo_id, station)
  `);

  // Who deleted which WhatsApp message, captured by the CRM when the delete succeeds.
  // The gateway only keeps an empty `revoked` tombstone, so the actor, station (including a
  // temporary grant) and the original body have to live CRM-side.
  await db._pool.query(`
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
    )
  `);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS idx_wmd_session_deleted
      ON whatsapp_message_deletions (session_id, deleted_at DESC)
  `);
  // Direction of the message that was deleted (sent by us or received), so the log reads
  // without a join back to a gateway row that may no longer exist.
  await db._pool.query(`
    ALTER TABLE whatsapp_message_deletions
      ADD COLUMN IF NOT EXISTS message_direction text
  `);
  // The passthrough and an explicit client call can both record the same delete; one row.
  await db._pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_wmd_session_message
      ON whatsapp_message_deletions (session_id, wa_message_id)
  `);
}
