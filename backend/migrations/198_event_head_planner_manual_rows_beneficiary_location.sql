-- Monthly Planner: persist Beneficiary and Location choices on manual rows.
--
-- The manual row's Beneficiary dropdown and Location dropdown previously lived
-- only in React state, so a reload lost them. Storing them on the manual row
-- keeps the grid, the PDF and the monthly report consistent with what the user
-- picked.
ALTER TABLE event_head_planner_manual_rows
  ADD COLUMN IF NOT EXISTS beneficiary TEXT,
  ADD COLUMN IF NOT EXISTS location    TEXT;
