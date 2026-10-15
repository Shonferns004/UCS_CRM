-- 185: Accept / reject review of the daily reports (Social Media).
--
-- The Social Media head reviews a submitted daily report and marks it accepted
-- or rejected. `review_status` starts 'pending' for every row (and so for every
-- existing row) and moves to 'accepted' / 'rejected' on review; the two actor
-- columns record who decided and when. A later save by the reporter re-opens the
-- review (the model resets these columns), so an old decision never stands
-- against newer content.
--
-- There is no migration runner in this repo (see 176_daily_reports.sql), so
-- every statement below is idempotent and can be hand-applied more than once.
ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Keep the status vocabulary closed so no write can store a third value the UI
-- does not know how to render. Dropped and re-added so re-running is safe.
ALTER TABLE daily_reports
  DROP CONSTRAINT IF EXISTS daily_reports_review_status_check;
ALTER TABLE daily_reports
  ADD CONSTRAINT daily_reports_review_status_check
  CHECK (review_status IN ('pending', 'accepted', 'rejected'));

-- The review queue lists a panel's reports for a date by status.
CREATE INDEX IF NOT EXISTS idx_daily_reports_review
  ON daily_reports (panel, report_date DESC, review_status);
