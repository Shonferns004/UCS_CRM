import db from '../config/db.js';

// Knowledge base for the smart-reply assistant: the questions operators are asked most, with the
// approved answer for each. Nothing here is ever sent on its own — the chat page drafts a reply
// from a match and waits for a human to send it.
export async function ensureWhatsAppReplySchema() {
  await db._pool.query(`
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
    )
  `);
  // Matching reads only enabled rows; the ngo column is already indexed for a future per-NGO scope.
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS idx_wrt_enabled ON whatsapp_reply_templates (enabled)
  `);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS idx_wrt_ngo ON whatsapp_reply_templates (ngo_id)
  `);
}
