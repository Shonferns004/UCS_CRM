-- Event Head — social-media publishing tracking.
--
-- One row per (event, platform). Records whether the event's content was
-- published on Instagram / Facebook / YouTube, with the upload link, the
-- upload date/time typed by the author, an optional proof attachment and,
-- when a platform does not apply, the reason it does not.
--
-- Applied on boot by backend/src/bootstrap/ensureEventHeadSchema.js, which
-- re-applies the same idempotent statements, because migrations are not
-- auto-run in this deployment.
--
-- UNIQUE(event_id, platform) is what makes "mark completed" idempotent: a
-- repeated submission upserts the same row instead of creating a duplicate.

CREATE TABLE IF NOT EXISTS event_head_social_tracking (
  id                    SERIAL PRIMARY KEY,
  event_id              INT NOT NULL REFERENCES event_head_events(id) ON DELETE CASCADE,
  platform              TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'Pending',
  url                   TEXT,
  content_type          TEXT,
  upload_date           DATE,
  upload_time           TEXT,
  proof_url             TEXT,
  not_applicable_reason TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_event_head_social_event
  ON event_head_social_tracking (event_id);
