-- 186: Reviewer's query / suggestion on a rejected daily report (Social Media).
--
-- When the Social Media head rejects a report they can type a query or
-- suggestion for the member. It is stored on the row so the member sees what to
-- fix (and the head sees their own last note). Cleared by the reporter's next
-- save, alongside the review status reset in the model.
--
-- The reject also raises a pending task for the member on their board; this
-- column is the message that travels with the review itself. `review_note` is
-- independent of the 185 columns so an install that added 185 but not 186 still
-- reads back its rows.
--
-- There is no migration runner in this repo (see 176_daily_reports.sql), so
-- every statement below is idempotent and can be hand-applied more than once.
ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS review_note TEXT;
