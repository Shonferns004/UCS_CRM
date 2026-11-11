-- 191_followup_loans.sql
--
-- Follow-up / Callback Loans: a station's open follow-up or callback leads are
-- lent to another station for a bounded window WITHOUT changing ownership.
-- No fro_assignments row is rewritten. See
-- backend/src/bootstrap/ensureFollowUpLoanSchema.js for the authoritative,
-- idempotent DDL that re-applies on every boot (migrations are not auto-run in
-- this deployment).
--
-- Rollback (additive only, no existing data touched):
--   DROP TABLE IF EXISTS followup_loan_events;
--   DROP TABLE IF EXISTS followup_loan_items;
--   DROP TABLE IF EXISTS followup_loans;

CREATE TABLE IF NOT EXISTS followup_loans (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ngo_id                uuid NOT NULL,
  source_station        text NOT NULL,
  source_fro_worker_id  uuid,
  target_station        text NOT NULL,
  target_fro_worker_id  uuid NOT NULL,
  scope                 text NOT NULL DEFAULT 'BOTH'
                        CHECK (scope IN ('BOTH', 'FOLLOW_UP', 'CALLBACK')),
  selection             text NOT NULL DEFAULT 'ALL_OPEN'
                        CHECK (selection IN ('ALL_OPEN', 'UPCOMING_ONLY', 'OVERDUE_ONLY', 'FIXED_COUNT')),
  status                text NOT NULL DEFAULT 'SCHEDULED'
                        CHECK (status IN ('SCHEDULED', 'ACTIVE', 'RETURNED', 'EXPIRED', 'REVOKED')),
  starts_at             timestamptz NOT NULL,
  expires_at            timestamptz NOT NULL,
  reason_code           text NOT NULL,
  reason_note           text,
  item_count            integer NOT NULL DEFAULT 0,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  returned_at           timestamptz,
  revoked_at            timestamptz,
  revoked_by            uuid,
  revocation_reason     text,
  CONSTRAINT fl_window_valid CHECK (expires_at > starts_at)
);

-- Widen the selection check on databases created before UPCOMING_ONLY.
ALTER TABLE followup_loans DROP CONSTRAINT IF EXISTS followup_loans_selection_check;
ALTER TABLE followup_loans ADD CONSTRAINT followup_loans_selection_check
  CHECK (selection IN ('ALL_OPEN', 'UPCOMING_ONLY', 'OVERDUE_ONLY', 'FIXED_COUNT'));

CREATE INDEX IF NOT EXISTS fl_worker_live
  ON followup_loans (target_fro_worker_id, starts_at, expires_at)
  WHERE status IN ('SCHEDULED', 'ACTIVE');
CREATE INDEX IF NOT EXISTS fl_source_live
  ON followup_loans (source_fro_worker_id, starts_at, expires_at)
  WHERE status IN ('SCHEDULED', 'ACTIVE');
CREATE INDEX IF NOT EXISTS fl_ngo_status
  ON followup_loans (ngo_id, status);
CREATE INDEX IF NOT EXISTS fl_source_station
  ON followup_loans (source_station);
CREATE INDEX IF NOT EXISTS fl_target_station
  ON followup_loans (target_station);

CREATE TABLE IF NOT EXISTS followup_loan_items (
  id                       bigserial PRIMARY KEY,
  loan_id                  uuid NOT NULL
                           REFERENCES followup_loans(id) ON DELETE CASCADE,
  assignment_id            integer NOT NULL,
  donor_id                 integer,
  ngo_id                   uuid NOT NULL,
  source_station           text NOT NULL,
  source_fro_worker_id     uuid,
  original_status          text,
  original_next_follow_up  date,
  returned_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fl_item_loan_assignment_uniq
  ON followup_loan_items (loan_id, assignment_id);
CREATE UNIQUE INDEX IF NOT EXISTS fl_item_live_assignment_uniq
  ON followup_loan_items (assignment_id)
  WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS fl_item_loan
  ON followup_loan_items (loan_id, returned_at);
CREATE INDEX IF NOT EXISTS fl_item_live
  ON followup_loan_items (assignment_id)
  WHERE returned_at IS NULL;

CREATE TABLE IF NOT EXISTS followup_loan_events (
  id              bigserial PRIMARY KEY,
  loan_id         uuid NOT NULL
                  REFERENCES followup_loans(id) ON DELETE CASCADE,
  event_type      text NOT NULL
                  CHECK (event_type IN (
                    'CREATED', 'EXTENDED', 'RETURNED_EARLY', 'REVOKED', 'EXPIRED'
                  )),
  actor_admin_id  uuid,
  actor_role      text,
  previous_state  jsonb,
  new_state       jsonb,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fl_events_loan
  ON followup_loan_events (loan_id, created_at);
