-- QA / Testing bug tracker for the Developer panel.
--
-- A tester (role 'tester', or anyone with Developer-panel access) reports a bug
-- from the panel. It lands in the 'Reported' lane and the development team drags
-- it across In Progress -> Fixed. Deliberately separate from the ticket tables:
-- a bug is a QA artifact (steps to reproduce, expected vs actual, severity) and
-- has its own board, not a support conversation.
--
-- Written with CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so this file
-- is replayed safely on every boot (see src/bootstrap/ensureBugsSchema.js).
CREATE TABLE IF NOT EXISTS bugs (
  id                BIGSERIAL   PRIMARY KEY,
  title             TEXT        NOT NULL,
  description       TEXT,
  steps             TEXT,
  expected_result   TEXT,
  actual_result     TEXT,
  module            TEXT,
  type              TEXT        NOT NULL DEFAULT 'bug',
  severity          TEXT        NOT NULL DEFAULT 'medium',
  status            TEXT        NOT NULL DEFAULT 'reported',
  environment       TEXT,
  screenshot_url    TEXT,
  resolution        TEXT,
  reported_by_id    TEXT,
  reported_by_name  TEXT,
  reported_by_panel TEXT,
  assigned_to       TEXT,
  assigned_name     TEXT,
  fixed_by_id       TEXT,
  fixed_at          TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Repair a partially-created table (CREATE IF NOT EXISTS is a no-op once the
-- table exists, even if a later column is missing).
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS description       TEXT;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS steps             TEXT;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS expected_result   TEXT;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS actual_result     TEXT;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS module          TEXT;
-- Issue type: bug | feature | task | improvement | story (defaults to bug).
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS type            TEXT NOT NULL DEFAULT 'bug';
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS severity        TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS status            TEXT NOT NULL DEFAULT 'reported';
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS environment       TEXT;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS screenshot_url    TEXT;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS resolution        TEXT;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS reported_by_id    TEXT;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS reported_by_name  TEXT;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS reported_by_panel TEXT;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS assigned_to       TEXT;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS assigned_name     TEXT;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS fixed_by_id       TEXT;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS fixed_at          TIMESTAMPTZ;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT now();

-- The board reads by status; filters run on severity/module/assignee.
CREATE INDEX IF NOT EXISTS idx_bugs_status   ON bugs (status);
CREATE INDEX IF NOT EXISTS idx_bugs_type     ON bugs (type);
CREATE INDEX IF NOT EXISTS idx_bugs_severity ON bugs (severity);
CREATE INDEX IF NOT EXISTS idx_bugs_module   ON bugs (module);
CREATE INDEX IF NOT EXISTS idx_bugs_assigned ON bugs (assigned_to);
CREATE INDEX IF NOT EXISTS idx_bugs_created  ON bugs (created_at DESC);

-- ── Lifecycle (report -> fix -> test -> close/reopen) ──────────────────────
-- status values: reported | in_progress | ready_for_test | closed | reopened
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS ready_for_test_at    TIMESTAMPTZ;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS ready_for_test_by_id TEXT;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS closed_at            TIMESTAMPTZ;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS closed_by_id         TEXT;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS reopened_at          TIMESTAMPTZ;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS reopen_count         INTEGER NOT NULL DEFAULT 0;

-- Legacy: 'fixed' meant "developer done, awaiting test" -> now 'ready_for_test'.
UPDATE bugs SET status = 'ready_for_test' WHERE status = 'fixed';

-- Audit trail: one row per status/assignee change so the detail view can show
-- the full cycle (who moved it, from where to where, when).
CREATE TABLE IF NOT EXISTS bug_history (
  id         BIGSERIAL   PRIMARY KEY,
  bug_id     BIGINT      NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
  field      TEXT,
  from_value TEXT,
  to_value   TEXT,
  actor_id   TEXT,
  actor_name TEXT,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bug_history_bug ON bug_history (bug_id, created_at DESC);
