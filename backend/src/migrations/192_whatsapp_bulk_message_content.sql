-- Persist what actually went out with a bulk template send so the Accounts >
-- WhatsApp Center > Chats thread can render the message body, header media and
-- buttons instead of an empty bubble.
--
-- Rollback:
--   ALTER TABLE whatsapp_bulk_recipients
--     DROP COLUMN IF EXISTS body_text,
--     DROP COLUMN IF EXISTS header_format,
--     DROP COLUMN IF EXISTS header_url,
--     DROP COLUMN IF EXISTS template_buttons;

ALTER TABLE whatsapp_bulk_recipients
  ADD COLUMN IF NOT EXISTS body_text TEXT,
  ADD COLUMN IF NOT EXISTS header_format TEXT,
  ADD COLUMN IF NOT EXISTS header_url TEXT,
  ADD COLUMN IF NOT EXISTS template_buttons JSONB;
