-- Monthly Report: the order of the programme cards inside an NGO's card.
--
-- The Monthly Report prints one card per programme the Monthly Planner planned
-- for the month, grouped per NGO. The Social head can drag those cards into the
-- order they want the report to read in; that arrangement is a presentation
-- choice, but it has to survive a reload and has to be the same for everyone
-- who opens the report - so it is stored here instead of in the browser.
--
-- One row per card. The card is the festival suggestion (the planner row) the
-- programme came from, identified by its id, so the order survives a rename of
-- the event. ngo_id scopes the order to the NGO whose card the programme sits
-- in, because every NGO's grid is arranged on its own.
--
-- The unique key keeps one position per card; the save path replaces the whole
-- set for a month + NGO, so a card that is removed from the report cannot
-- leave a stale position behind.
CREATE TABLE IF NOT EXISTS event_head_report_card_order (
  id            BIGSERIAL   PRIMARY KEY,
  report_month  INT         NOT NULL,
  report_year   INT         NOT NULL,
  -- '' (never NULL) when no NGO could be resolved, so the unique key below
  -- can never be bypassed by Postgres' NULL-is-distinct rule.
  ngo_id        TEXT        NOT NULL DEFAULT '',
  card_key      TEXT        NOT NULL,
  position      INT         NOT NULL DEFAULT 0,
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_month, report_year, ngo_id, card_key)
);

-- The report is always read one month at a time.
CREATE INDEX IF NOT EXISTS idx_event_head_report_card_order_month
  ON event_head_report_card_order (report_year, report_month);
