-- 176: Daily reports — the shared per-panel daily report storage.
--
-- Used by the Developer and Social Media daily reports. The HR daily report
-- keeps its own hr_daily_reports table because it carries structured absence /
-- recruiter-MIS columns that predate this table; if that ever moves here, its
-- columns map naturally onto the `data` JSONB.
--
-- Shape of `data` (JSONB): { "<sectionId>": { "<fieldId>": value } } where
-- value is a string (a section's fields are typed text / line lists; KPI and
-- other derived figures are never stored here — they are recomputed live by the
-- client from the same endpoints the panel already uses).
--
-- One row per (panel, report_date, reporter_name). A reporter owns their own
-- day; a second reporter filling the same date gets their own row rather than
-- overwriting the first one's data. `panel` whitelist is enforced in the
-- controller, not here, so adding a panel later is a code change, not a schema
-- migration. (There is no migration runner in this repo — these files are
-- hand-applied — so every statement below is idempotent.)

CREATE TABLE IF NOT EXISTS daily_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  panel           TEXT NOT NULL,
  report_date     DATE NOT NULL,
  reporter_name   TEXT NOT NULL,
  -- { "<sectionId>": { "<fieldId>": "text" } }
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Text, not a users(id) FK: the JWT subject is written as a string everywhere
  -- else in this codebase (hr_daily_reports.created_by, receipts.created_by).
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT daily_reports_date_panel_reporter_key UNIQUE (panel, report_date, reporter_name)
);

CREATE INDEX IF NOT EXISTS idx_daily_reports_panel_date
  ON daily_reports (panel, report_date DESC);

-- Keeps updated_at honest on writes that go through the query builder's
-- .update() (which does not set it automatically) as well as on upsert.
CREATE OR REPLACE FUNCTION daily_reports_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS daily_reports_touch ON daily_reports;
CREATE TRIGGER daily_reports_touch
  BEFORE UPDATE ON daily_reports
  FOR EACH ROW EXECUTE FUNCTION daily_reports_touch_updated_at();