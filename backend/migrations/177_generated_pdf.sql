-- Generated landscape PDF alongside each certificate's native output.
-- Idempotent. Run manually if the bootstrap did not apply it.

ALTER TABLE certificates ADD COLUMN IF NOT EXISTS generated_pdf TEXT DEFAULT '';
