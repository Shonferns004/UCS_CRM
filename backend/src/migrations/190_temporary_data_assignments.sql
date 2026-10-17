-- 190_temporary_data_assignments.sql
--
-- Temporary Data Access: admin-granted, time-boxed permission for an FRO to
-- work on another station's donor data WITHOUT changing permanent ownership.
--
-- NOTE ON HOW SCHEMA IS APPLIED IN THIS DEPLOYMENT:
-- Migrations are NOT auto-run here. The authoritative, idempotent version of
-- this DDL lives in backend/src/bootstrap/ensureTemporaryDataAccessSchema.js
-- and re-applies on every boot. This file is the tracked documentation copy,
-- mirroring the convention of backend/src/migrations/18x files.
--
-- Rollback:
--   DROP TABLE IF EXISTS temporary_data_assignment_events;
--   DROP TABLE IF EXISTS temporary_data_assignments;
-- (Both are new, additive tables; dropping them affects no existing data.)

CREATE TABLE IF NOT EXISTS temporary_data_assignments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ngo_id                uuid NOT NULL,
  station               text NOT NULL,
  working_fro_worker_id uuid NOT NULL,
  granted_by_admin_id   uuid NOT NULL,
  scope_type            text NOT NULL DEFAULT 'STATION_ALL'
                        CHECK (scope_type IN ('STATION_ALL', 'SELECTED_DONORS')),
  starts_at             timestamptz NOT NULL,
  expires_at            timestamptz NOT NULL,
  status                text NOT NULL DEFAULT 'SCHEDULED'
                        CHECK (status IN ('SCHEDULED', 'ACTIVE', 'REVOKED', 'EXPIRED', 'CANCELLED')),
  reason_code           text NOT NULL,
  reason_note           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  revoked_at            timestamptz,
  revoked_by_admin_id   uuid,
  revocation_reason     text,
  CONSTRAINT tda_window_valid CHECK (expires_at > starts_at)
);

-- One live grant per (station, working FRO); revoked/expired rows do not block
-- re-granting later.
CREATE UNIQUE INDEX IF NOT EXISTS tda_active_station_fro_uniq
  ON temporary_data_assignments (station, working_fro_worker_id)
  WHERE status IN ('SCHEDULED', 'ACTIVE');

CREATE INDEX IF NOT EXISTS tda_working_fro_status
  ON temporary_data_assignments (working_fro_worker_id, status);

CREATE INDEX IF NOT EXISTS tda_ngo_status
  ON temporary_data_assignments (ngo_id, status);

-- Authorization hot path: "live grant for this worker right now?"
CREATE INDEX IF NOT EXISTS tda_live_window
  ON temporary_data_assignments (working_fro_worker_id, starts_at, expires_at)
  WHERE status IN ('SCHEDULED', 'ACTIVE');

CREATE INDEX IF NOT EXISTS tda_station_live
  ON temporary_data_assignments (station, ngo_id)
  WHERE status = 'ACTIVE';

-- Append-only lifecycle audit. No passwords, switching secrets or donor PII.
CREATE TABLE IF NOT EXISTS temporary_data_assignment_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid NOT NULL
                  REFERENCES temporary_data_assignments(id) ON DELETE CASCADE,
  event_type      text NOT NULL
                  CHECK (event_type IN (
                    'GRANTED', 'SCOPE_CHANGED', 'EXTENDED', 'REVOKED',
                    'EXPIRED', 'CANCELLED', 'STATUS_OVERRIDE', 'ACCESS_DENIED'
                  )),
  actor_admin_id  uuid,
  actor_role      text,
  previous_state  jsonb,
  new_state       jsonb,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tda_events_assignment
  ON temporary_data_assignment_events (assignment_id, created_at);
