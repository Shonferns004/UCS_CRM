import db from '../config/db.js';

// Message templates for Accounts → WhatsApp (OpenWA). They belong to an NGO, not to a
// phone number: an operator can build the library before any session exists, and every
// session later assigned to that NGO reads the same set. The gateway's own
// per-session `templates` table is left untouched for API/SDK callers.
export async function ensureOpenwaTemplateSchema() {
  await db._pool.query(`
    CREATE TABLE IF NOT EXISTS openwa_message_templates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ngo_id uuid NOT NULL REFERENCES ngos(id) ON DELETE CASCADE,
      name varchar(100) NOT NULL,
      header text,
      body text NOT NULL,
      footer text,
      message_type varchar(20) NOT NULL DEFAULT 'text',
      media_url text,
      media_filename varchar(255),
      created_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  // One template name per NGO: keeps the picker unambiguous and rejects duplicates.
  await db._pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_omt_ngo_name
      ON openwa_message_templates (ngo_id, name)
  `);
  // The library is always read for one NGO, newest first.
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS idx_omt_ngo_updated
      ON openwa_message_templates (ngo_id, updated_at DESC)
  `);
}
