-- 177: Daily department reporting — employee identity + HOD review.
--
-- Extends the shared daily_reports table (176) so each row records *who* filled
-- it (a stable reporter_id, not just the display name), which department it
-- belongs to, and the HOD's review remark. Everything here is additive and
-- idempotent. There is no migration runner in this repo — these files are
-- hand-applied, so re-running this script must be safe.

ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS department  TEXT,
  ADD COLUMN IF NOT EXISTS reporter_id TEXT,
  ADD COLUMN IF NOT EXISTS remark      TEXT,
  ADD COLUMN IF NOT EXISTS remark_by   TEXT,
  ADD COLUMN IF NOT EXISTS remark_at   TIMESTAMPTZ;

-- Existing rows predate the department column; the panel key is its legacy
-- equivalent ('dev' | 'hr' | 'recruiter' | 'social').
UPDATE daily_reports SET department = panel WHERE department IS NULL;

-- The HOD dashboard pages by (department, date) and the reporter form looks up
-- its own row by (panel, date, reporter_id).
CREATE INDEX IF NOT EXISTS idx_daily_reports_dept_date
  ON daily_reports (department, report_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_reports_reporter
  ON daily_reports (panel, report_date, reporter_id);
