-- 183: restore public.attendance_corrections.
--
-- The attendance-correction ticket flow (raise / pending / hr-verify / approve)
-- 500s on every endpoint with "relation attendance_corrections does not exist",
-- because the table only exists in the stale `test` schema after the RDS
-- migration; the live `public` schema lost it. search_path is `public, extensions`,
-- so unqualified reads/writes hit nothing.
--
-- This recreates the table in `public` (with the same columns, defaults, checks,
-- indexes and grants as the `test` copy) and copies all existing rows across. It
-- does NOT add FK constraints: the rows were created against test-schema data and
-- two reference workers/attendance rows that no longer exist in `public`; the
-- query builder resolves the workers(...)/attendance(...) embeds by column-name
-- heuristic, matching how support_tickets/developer_tickets survived the same
-- constraint-drop.
--
-- Applied directly to RDS via the db tunnel on 2026-10-10. Migrations are not
-- auto-run in this deployment, so this file is the record of what was applied.

CREATE TABLE public.attendance_corrections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL,
  attendance_id uuid NOT NULL,
  date date NOT NULL,
  field text NOT NULL,
  requested_time timestamptz NOT NULL,
  reason text NOT NULL,
  status text DEFAULT 'pending',
  hr_remark text,
  admin_remark text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

INSERT INTO public.attendance_corrections
  (id, worker_id, attendance_id, date, field, requested_time, reason, status, hr_remark, admin_remark, created_at, updated_at)
SELECT id, worker_id, attendance_id, date, field, requested_time, reason, status, hr_remark, admin_remark, created_at, updated_at
FROM test.attendance_corrections;

ALTER TABLE public.attendance_corrections
  ADD CONSTRAINT attendance_corrections_pkey PRIMARY KEY (id),
  ADD CONSTRAINT attendance_corrections_field_check CHECK (field IN ('punch_in','punch_out')),
  ADD CONSTRAINT attendance_corrections_status_check CHECK (status IN ('pending','hr_verified','approved','rejected'));

CREATE INDEX attendance_corrections_worker_id_idx ON public.attendance_corrections (worker_id);
CREATE INDEX attendance_corrections_attendance_id_idx ON public.attendance_corrections (attendance_id);
CREATE INDEX attendance_corrections_status_idx ON public.attendance_corrections (status);

ALTER TABLE public.attendance_corrections OWNER TO ucs_app;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON public.attendance_corrections TO ucs_app;