-- Image certificate templates: canvas dimensions + per-field visual style.
-- Idempotent. Run manually if the bootstrap did not apply it.

ALTER TABLE certificate_templates ADD COLUMN IF NOT EXISTS canvas_width INT;
ALTER TABLE certificate_templates ADD COLUMN IF NOT EXISTS canvas_height INT;
ALTER TABLE certificate_template_fields ADD COLUMN IF NOT EXISTS style JSONB NOT NULL DEFAULT '{}'::jsonb;
