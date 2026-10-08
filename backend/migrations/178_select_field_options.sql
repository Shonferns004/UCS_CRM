-- Per-field dropdown options for select-type certificate fields.
-- Idempotent. Run manually if the bootstrap did not apply it.

ALTER TABLE certificate_template_fields ADD COLUMN IF NOT EXISTS options TEXT DEFAULT '';
