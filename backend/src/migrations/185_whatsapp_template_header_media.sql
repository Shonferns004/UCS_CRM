-- Cache an approved template's own header media so the same image/document
-- goes out with every send of that template, instead of the agent re-attaching
-- a file each time.
--
-- Meta exposes the header only as a short-lived sample URL under
-- components[].example.header_handle, which expires, so the asset is copied
-- into our own bucket once and referenced by key from then on.
--
-- Rollback:
--   ALTER TABLE whatsapp_templates
--     DROP COLUMN IF EXISTS header_storage_key,
--     DROP COLUMN IF EXISTS header_mime_type;

ALTER TABLE whatsapp_templates
  ADD COLUMN IF NOT EXISTS header_storage_key text,
  ADD COLUMN IF NOT EXISTS header_mime_type text;

COMMENT ON COLUMN whatsapp_templates.header_storage_key IS
  'S3 object key of the cached header media for this template';
COMMENT ON COLUMN whatsapp_templates.header_mime_type IS
  'Mime type of the cached header media';
