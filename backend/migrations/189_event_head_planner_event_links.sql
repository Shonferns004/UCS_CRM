-- Monthly Planner: which programme row already produced an event.
--
-- A planner row is identified by its date and festival name. When the Social
-- head completes a row's five deliverables and creates the event, the row's
-- "Create Event" button must stay replaced by "Download" on every device and
-- after a reload — not only in the tab that created it. That fact is recorded
-- here, keyed by (observance_date, festival), so the link is durable. The event
-- is the real anchor: deleting the event removes the row's link with it.
--
-- The existing event_head_festival_suggestions.suggested_event_id link is kept
-- as-is; this table is the row-level link that also covers typed/manual rows and
-- rows with no generated AI suggestion at all.
CREATE TABLE IF NOT EXISTS event_head_planner_event_links (
  id              BIGSERIAL   PRIMARY KEY,
  observance_date DATE        NOT NULL,
  festival        TEXT        NOT NULL DEFAULT '',
  ngo_id          TEXT,
  event_id        BIGINT      NOT NULL REFERENCES event_head_events(id) ON DELETE CASCADE,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One link per programme row: its date + festival together are unique.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_head_planner_event_links_row
  ON event_head_planner_event_links (observance_date, festival);

-- The planner loads a whole month at a time.
CREATE INDEX IF NOT EXISTS idx_event_head_planner_event_links_date
  ON event_head_planner_event_links (observance_date);
