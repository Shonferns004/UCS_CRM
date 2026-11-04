import db from '../config/db.js';

export async function ensureWhatsAppBulkSchema() {
  await db._pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_bulk_recipients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id TEXT,
      template_name TEXT,
      recipient_name TEXT,
      phone TEXT,
      wa_message_id TEXT UNIQUE,
      status TEXT DEFAULT 'sent',
      failure_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      status_updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await db._pool.query(`CREATE INDEX IF NOT EXISTS idx_whatsapp_bulk_recipients_wa_message_id ON whatsapp_bulk_recipients(wa_message_id);`);
  await db._pool.query(`CREATE INDEX IF NOT EXISTS idx_whatsapp_bulk_recipients_status ON whatsapp_bulk_recipients(status);`);

  // The content that actually went out with the template. Without these the
  // Chats tab could only show "[Template: name]" (or nothing at all when the
  // template was no longer in whatsapp_templates), which is why sent bubbles
  // rendered empty. Existing rows keep NULL and fall back to the template
  // lookup / label in getConversationByPhone.
  await db._pool.query(`ALTER TABLE whatsapp_bulk_recipients ADD COLUMN IF NOT EXISTS body_text TEXT;`);
  await db._pool.query(`ALTER TABLE whatsapp_bulk_recipients ADD COLUMN IF NOT EXISTS header_format TEXT;`);
  await db._pool.query(`ALTER TABLE whatsapp_bulk_recipients ADD COLUMN IF NOT EXISTS header_url TEXT;`);
  await db._pool.query(`ALTER TABLE whatsapp_bulk_recipients ADD COLUMN IF NOT EXISTS template_buttons JSONB;`);
}

export default ensureWhatsAppBulkSchema;
