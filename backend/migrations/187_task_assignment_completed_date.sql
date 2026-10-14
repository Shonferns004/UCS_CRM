-- The day a Social Media member actually completed an assigned task.
--
-- `task_date` is the planned / programme day, but a member may do the work on a
-- different day (early or late). The head reviews the Daily Report for the day
-- the WORK was done (see openReviewForReporter, which opens the row on the
-- current IST day), and the Monthly Planner then paints that member's cell green
-- for every task finished on a day whose report was accepted. Without this the
-- planner could only ever match a programme done on the exact programme day.
ALTER TABLE task_assignments
  ADD COLUMN IF NOT EXISTS completed_date DATE;

-- Done rows created before this column existed fall back to their planned day,
-- which is exactly what the planner keyed on before, so their behaviour is
-- unchanged (a report accepted for the programme day still greens them).
UPDATE task_assignments
   SET completed_date = task_date
 WHERE completed_date IS NULL AND status = 'done';

-- The planner reads (panel, assignee, completed_date) to decide a cell's colour.
CREATE INDEX IF NOT EXISTS idx_task_assignments_completed
  ON task_assignments (panel, assignee_id, completed_date);
