-- 087: Controlled, backend-driven FRO donor queue + DB-level duplicate protection.
--
-- work_queue is a derived, per-worker ordered snapshot of which donors are in
-- the FRO's active work cycle (bound by "cycle_key" = the (station, ngo, tab,
-- month) scope — this system has no separate campaigns entity, the cycle is the
-- station/NGO work scope for a billing month). It does NOT replace
-- fro_assignments/fro_donor_logs as the source of truth; it records the ordered
-- positions the backend hands out as the "current donor", so a donor can never
-- be enqueued twice for the same worker+scope, and so the queue position is a
-- durable, backend-authoritative value instead of a client cursor.

CREATE TABLE IF NOT EXISTS work_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id     uuid NOT NULL REFERENCES workers(id),
  operator_id   uuid,                    -- imposter_id when working-as (for audit)
  donor_id      integer NOT NULL REFERENCES donor_profiles(id),
  ngo_id        uuid,                    -- one of the worker's (station,ngo) pairs
  station       text,
  data_tab      text NOT NULL DEFAULT 'new',           -- 'new' | 'old'
  cycle_key     text NOT NULL,                          -- `${ngo|all}:${station|all}:${tab}:${month}`
  position      integer NOT NULL,                       -- 0-based order in this cycle
  status        text NOT NULL DEFAULT 'PENDING',
                -- PENDING | IN_PROGRESS | BUTTON_PRESSED | DISPOSED | COMPLETED | EXCEPTION
  first_seen_at timestamptz,
  last_shown_at timestamptz,
  disposed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- One donor once per worker per cycle -> duplicate protection at the DB layer.
  CONSTRAINT uq_work_queue_scope UNIQUE (worker_id, donor_id, ngo_id, cycle_key)
);

CREATE INDEX IF NOT EXISTS idx_work_queue_worker_cycle_pos
  ON work_queue(worker_id, cycle_key, position);

CREATE INDEX IF NOT EXISTS idx_work_queue_worker_status
  ON work_queue(worker_id, status);

-- DB-level duplicate protection on disposition logs: the same worker cannot
-- create two same-day disposition rows for the same (assignment, detail). This
-- hardens the app-level same-day dedup (findDispositionLogToday) so an
-- accidental double-save / double-click / second-tab save cannot insert a
-- duplicate timeline entry.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'fro_donor_logs'
      AND indexname = 'uq_fro_donor_logs_same_day_disp'
  ) THEN
    CREATE UNIQUE INDEX uq_fro_donor_logs_same_day_disp
      ON fro_donor_logs(assignment_id, fro_worker_id, disposition_detail, created_at::date)
      WHERE action = 'disposition';
  END IF;
END $$;
