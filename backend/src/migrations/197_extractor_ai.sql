-- Extractor AI tagging - keyword vocabulary.
--
-- Tags on a lead are chosen only from these keywords, so the panel's AI filter
-- always matches what the model produced. The ai_* columns on extractor_leads
-- were created by 196_extractor.sql; this migration only adds the vocabulary.
--
-- Also applied idempotently on every boot by
-- backend/src/bootstrap/ensureExtractorSchema.js.

CREATE TABLE IF NOT EXISTS extractor_ai_keywords (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  TEXT NOT NULL DEFAULT 'default',
  keyword       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS extractor_ai_keywords_unique_idx
  ON extractor_ai_keywords (workspace_id, lower(keyword));

CREATE INDEX IF NOT EXISTS extractor_ai_keywords_workspace_idx
  ON extractor_ai_keywords (workspace_id, created_at);
