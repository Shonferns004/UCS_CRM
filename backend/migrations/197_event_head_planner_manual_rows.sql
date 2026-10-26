-- Monthly Planner: typed/manual programme rows that must survive a reload.
--
-- The planner's "Write manually" text, the event name typed on a row and the
-- extra rows added with "+ Add another programme" used to live in React state
-- only. Creating an event persisted the event itself, but the planner row that
-- produced it disappeared on refresh, so the programme looked lost.
--
-- A row is identified by (observance_date, festival, ngo_id), the same identity
-- the durable row -> event link uses. An extra row carries a synthetic festival
-- suffix beginning with "+"; a normal festival row carries its festival name
-- (or '' for a date with no observance). ngo_id is the planner's NGO scope and
-- is stored as '' (never NULL) for "All NGOs" so the unique key is stable.
-- row_ngo_id is the row's own NGO dropdown value, kept separately because an
-- extra row can be pointed at an NGO different from the page-wide scope.
CREATE TABLE IF NOT EXISTS event_head_planner_manual_rows (
  id              BIGSERIAL   PRIMARY KEY,
  report_month    INTEGER     NOT NULL,
  report_year     INTEGER     NOT NULL,
  observance_date DATE        NOT NULL,
  festival        TEXT        NOT NULL DEFAULT '',
  ngo_id          TEXT        NOT NULL DEFAULT '',
  row_ngo_id      TEXT        NOT NULL DEFAULT '',
  name            TEXT        NOT NULL DEFAULT '',
  body_text       TEXT        NOT NULL DEFAULT '',
  is_selected     BOOLEAN     NOT NULL DEFAULT false,
  mode            TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One manual row per planner row in an NGO scope. ngo_id is '' rather than NULL
-- because Postgres treats NULLs as distinct and would allow duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_head_planner_manual_rows_row
  ON event_head_planner_manual_rows (observance_date, festival, ngo_id);

-- The planner loads a whole month at a time, typically for one NGO.
CREATE INDEX IF NOT EXISTS idx_event_head_planner_manual_rows_month
  ON event_head_planner_manual_rows (report_year, report_month, ngo_id);
