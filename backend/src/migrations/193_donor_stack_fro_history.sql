-- 193_donor_stack_fro_history.sql
--
-- Append-only history of FRO assignments per donor stack. donor_stacks only
-- stores the current fro_worker_id, so reassignments used to erase the
-- previous holder. Each row is one assignment window; the row with
-- unassigned_at IS NULL is the current assignment.
--
-- NOTE ON HOW SCHEMA IS APPLIED IN THIS DEPLOYMENT:
-- Migrations are NOT auto-run here. The authoritative, idempotent version of
-- this DDL lives in backend/src/bootstrap/ensureStackFroHistorySchema.js and
-- re-applies on every boot. This file is the tracked documentation copy.
--
-- Rollback:
--   DROP TABLE IF EXISTS donor_stack_fro_history;

CREATE TABLE IF NOT EXISTS donor_stack_fro_history (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stack_id              uuid NOT NULL REFERENCES donor_stacks(id) ON DELETE CASCADE,
  fro_worker_id         uuid,
  fro_name              text,
  assigned_by_admin_id  uuid,
  assigned_at           timestamptz NOT NULL DEFAULT now(),
  unassigned_at         timestamptz,
  unassigned_reason     text
);

CREATE INDEX IF NOT EXISTS donor_stack_fro_history_stack
  ON donor_stack_fro_history (stack_id, assigned_at DESC);

CREATE INDEX IF NOT EXISTS donor_stack_fro_history_open
  ON donor_stack_fro_history (stack_id)
  WHERE unassigned_at IS NULL;
