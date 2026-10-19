import db from '../config/db.js';

// Temporary Data Access — admin-granted, time-boxed permission for an FRO to
// work on ANOTHER station's donor data without becoming its owner.
//
// Why a separate table: permanent ownership lives in fro_station_assignments
// (one row per (ngo_id, station), fro_worker_id = the seat's owner) and donor
// assignment rows in fro_assignments. Reusing either for temporary access
// would either transfer ownership (which must never happen) or require
// rewriting every reader of those tables. This layer sits beside them: a
// grant says "this worker may READ/WRITE donor data in this (station, ngo)
// window", and nothing else. Ownership, receipts and historical attribution
// are untouched.
//
// scope_type is STATION_ALL in v1 (whole-station grants only). The
// SELECTED_DONORS value and its child table are a follow-up; the column
// exists now so v1 rows are forward-compatible.
// scope_type now supports: STATION_ALL (full station), STATION_HIGH_TIER
// (high-tier donors only), STATION_NORMAL (normal donors only). A station
// can have at most 2 grants if separated (high + normal), or 1 if full.
//
// expires_at is NOT NULL: there is deliberately no "indefinite" grant. A
// forgotten open-ended grant is a permanent data-access hole.
//
// Migrations are not auto-run in this deployment, so this re-runs safely on
// every boot (CREATE ... IF NOT EXISTS), the same approach as
// ensureAuthSessionSchema/ensureTicketSchema.

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS temporary_data_assignments (
     id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     ngo_id                uuid NOT NULL,
     station               text NOT NULL,
     working_fro_worker_id uuid NOT NULL,
     granted_by_admin_id   uuid NOT NULL,
     scope_type            text NOT NULL DEFAULT 'STATION_ALL'
                           CHECK (scope_type IN ('STATION_ALL', 'SELECTED_DONORS', 'STATION_HIGH_TIER', 'STATION_NORMAL')),
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
   )`,
  // One live grant per (station, working FRO). Partial, so a revoked/expired
  // row never blocks re-granting the same pair later — the duplicate check in
  // the API is advisory (it offers "extend instead"), this is the backstop
  // against two admins creating concurrent rows.
  // Update scope_type CHECK constraint for existing tables (new scope types).
  `ALTER TABLE temporary_data_assignments DROP CONSTRAINT IF EXISTS temporary_data_assignments_scope_type_check`,
  `ALTER TABLE temporary_data_assignments ADD CONSTRAINT temporary_data_assignments_scope_type_check CHECK (scope_type IN ('STATION_ALL', 'SELECTED_DONORS', 'STATION_HIGH_TIER', 'STATION_NORMAL'))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tda_active_station_fro_uniq
     ON temporary_data_assignments (station, working_fro_worker_id)
     WHERE status IN ('SCHEDULED', 'ACTIVE')`,
  `CREATE INDEX IF NOT EXISTS tda_working_fro_status
     ON temporary_data_assignments (working_fro_worker_id, status)`,
  `CREATE INDEX IF NOT EXISTS tda_ngo_status
     ON temporary_data_assignments (ngo_id, status)`,
  // The authorization hot path: "does this worker hold a live grant right
  // now?" — partial on the live statuses so the index stays tiny.
  `CREATE INDEX IF NOT EXISTS tda_live_window
     ON temporary_data_assignments (working_fro_worker_id, starts_at, expires_at)
     WHERE status IN ('SCHEDULED', 'ACTIVE')`,
  `CREATE INDEX IF NOT EXISTS tda_station_live
     ON temporary_data_assignments (station, ngo_id)
     WHERE status = 'ACTIVE'`,

  // Append-only audit of every lifecycle transition. previous_state /
  // new_state are jsonb snapshots of the row's relevant fields, so an
  // auditor sees what changed without diffing prose. Never store passwords,
  // switching secrets or donor PII here.
  `CREATE TABLE IF NOT EXISTS temporary_data_assignment_events (
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
   )`,
  `CREATE INDEX IF NOT EXISTS tda_events_assignment
     ON temporary_data_assignment_events (assignment_id, created_at)`,
];

export async function ensureTemporaryDataAccessSchema() {
  for (const s of STATEMENTS) {
    try {
      await db._pool.query(s);
    } catch (e) {
      // Lost a race with a parallel boot, or the role cannot CREATE. Not fatal
      // for the rest of the boot — but the feature's routes will 503 until the
      // table exists, which the service detects and reports explicitly.
      console.warn('[temporary data access schema] skip:', e?.message || String(e));
    }
  }
}
