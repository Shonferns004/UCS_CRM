import db from '../config/db.js';

export async function ensureCampaignSchema() {
  await db._pool.query(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'whatsapp',
      status TEXT NOT NULL DEFAULT 'completed',
      account_id TEXT,
      template_name TEXT,
      created_by TEXT,
      scheduled_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await db._pool.query(`ALTER TABLE whatsapp_bulk_recipients ADD COLUMN IF NOT EXISTS campaign_id UUID;`);
  await db._pool.query(`CREATE INDEX IF NOT EXISTS idx_whatsapp_bulk_recipients_campaign_id ON whatsapp_bulk_recipients(campaign_id);`);
}

export default ensureCampaignSchema;