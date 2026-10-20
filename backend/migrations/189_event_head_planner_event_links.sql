-- Monthly Planner: which programme row already produced an event.
--
-- A planner row is identified by its date, festival name AND the NGO it is
-- planned for — BSCT and MANN may both plan the same festival on the same date,
-- and each keeps its own link. When the Social head completes a row's five
-- deliverables and creates the event, the row's "Create Event" button must stay
-- replaced by "Download" on every device and after a reload — not only in the
-- tab that created it. That fact is recorded here, so the link is durable. The
-- event is the real anchor: deleting the event removes the row's link with it.
--
-- The existing event_head_festival_suggestions.suggested_event_id link is kept
-- as-is; this table is the row-level link that also covers typed/manual rows and
-- rows with no generated AI suggestion at all.
CREATE TABLE IF NOT EXISTS event_head_planner_event_links (
  id              BIGSERIAL   PRIMARY KEY,
  observance_date DATE        NOT NULL,
  festival        TEXT        NOT NULL DEFAULT '',
  -- '' (never NULL) when no NGO could be resolved: NULL is distinct to
  -- Postgres, so it would bypass the unique key below and let two NGOs share
  -- one link row again.
  ngo_id          TEXT        NOT NULL DEFAULT '',
  event_id        BIGINT      NOT NULL REFERENCES event_head_events(id) ON DELETE CASCADE,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One link per programme row FOR ITS NGO: date + festival + NGO together are
-- unique. BSCT and MANN may both plan the same festival on the same date; each
-- keeps its own link, so one NGO's created event can never open (or show as
-- completed) on the other's row. 193 drops the older (date, festival) key this
-- replaces. ngo_id is never NULL in the key — it is stored as '' when unknown,
-- because Postgres treats NULLs as distinct and would let duplicates through.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_head_planner_event_links_row_ngo
  ON event_head_planner_event_links (observance_date, festival, ngo_id);

-- The planner loads a whole month at a time.
CREATE INDEX IF NOT EXISTS idx_event_head_planner_event_links_date
  ON event_head_planner_event_links (observance_date);
