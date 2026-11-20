import db from '../config/db.js';

// Per-number delivery log for the "new lead → WhatsApp" alert. One row per
// (lead, number): the unique key is what stops the webhook, the Meta poller and
// a Google CSV import from messaging the same lead twice.
export async function ensureLeadWhatsAppAlertSchema() {
  await db._pool.query(`
    CREATE TABLE IF NOT EXISTS lead_alert_deliveries (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id         TEXT,
      source          TEXT NOT NULL DEFAULT '',
      dedupe_key      TEXT NOT NULL,
      phone           TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending',
      error           TEXT,
      attempts        INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TIMESTAMPTZ,
      sent_at         TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await db._pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS lead_alert_deliveries_key_phone_uidx
      ON lead_alert_deliveries (dedupe_key, phone)
  `);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS lead_alert_deliveries_pending_idx
      ON lead_alert_deliveries (created_at)
      WHERE sent_at IS NULL
  `);
}

export default ensureLeadWhatsAppAlertSchema;
