-- Extractor bulk-send usage (global used/unused).
--
-- One row per phone that has actually received a WhatsApp bulk message. The key
-- is the phone, not the lead: WhatsApp identity is the number, and the same
-- number can appear under two captured rows.
--
-- Only successful sends are recorded (accepted / sent / delivered / read).
-- Failed attempts stay unused so they can be retried.
--
-- Also applied on every boot by backend/src/bootstrap/ensureExtractorSchema.js.

CREATE TABLE IF NOT EXISTS extractor_lead_outreach (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164    TEXT NOT NULL UNIQUE,
  lead_id       UUID REFERENCES extractor_leads(id) ON DELETE SET NULL,
  campaign_id   UUID,
  ngo_id        TEXT,
  status        TEXT NOT NULL DEFAULT 'sent',
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS extractor_lead_outreach_ngo_idx
  ON extractor_lead_outreach (ngo_id);
CREATE INDEX IF NOT EXISTS extractor_lead_outreach_campaign_idx
  ON extractor_lead_outreach (campaign_id);

-- Link a bulk recipient back to its extractor lead for audit.
ALTER TABLE whatsapp_bulk_recipients ADD COLUMN IF NOT EXISTS extractor_lead_id UUID;
ALTER TABLE whatsapp_bulk_recipients ADD COLUMN IF NOT EXISTS ngo_id TEXT;
CREATE INDEX IF NOT EXISTS idx_whatsapp_bulk_recipients_extractor_lead
  ON whatsapp_bulk_recipients (extractor_lead_id);
