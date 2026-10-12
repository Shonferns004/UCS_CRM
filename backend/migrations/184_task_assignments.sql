-- Social Media team task assignments.
--
-- A Social Media manager (Shital) assigns a task to one member of the Social
-- roster for a given date. The assignee sees it read-only on that date's Daily
-- Report and still adds their own tasks; the assigner can review and remove the
-- ones they created. Nothing else in the schema is touched.
CREATE TABLE IF NOT EXISTS task_assignments (
  id               BIGSERIAL   PRIMARY KEY,
  panel            TEXT        NOT NULL DEFAULT 'social',
  task_date        DATE        NOT NULL,
  title            TEXT        NOT NULL,
  description      TEXT,
  assignee_id      TEXT        NOT NULL,
  assignee_name    TEXT        NOT NULL,
  assigned_by_id   TEXT,
  assigned_by_name TEXT,
  status           TEXT        NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Existing installations created before the status column existed: add it
-- idempotently so the assignee can move a task Pending -> WIP -> Done.
ALTER TABLE task_assignments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

-- Look-up by (panel, assignee, date) powers the assignee's Daily Report block;
-- the (panel, date) index powers the assigner's day view.
CREATE INDEX IF NOT EXISTS idx_task_assignments_assignee
  ON task_assignments (panel, assignee_id, task_date);

CREATE INDEX IF NOT EXISTS idx_task_assignments_date
  ON task_assignments (panel, task_date);
