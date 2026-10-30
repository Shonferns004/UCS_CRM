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
}

export default ensureWhatsAppBulkSchema;