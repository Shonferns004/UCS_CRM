-- 181: station agent of record.
--
-- A station used to remember only which FRO sat in it, and every read path
-- derived the agent by asking "which agent covers this worker right now". That
-- made a station belong to a PERSON rather than to a SEAT: reassigning the FRO
-- (Agent 1's Mahima becomes Agent 3's Mahima) silently changed the owner of
-- every station that agent held, with no edit made to those stations.
--
-- crm_agent_id is the agent of record. fro_worker_id stays in step with whichever
-- FRO that agent currently covers, so the existing readers -- donor lists,
-- dashboards, search, credit, salary -- keep resolving through
-- fro_assignments.fro_worker_id and none of them need rewriting.
--
-- Applied on boot by backend/src/bootstrap/ensureStationAgentOfRecordSchema.js,
-- which is idempotent, because migrations are not auto-run in this deployment.

ALTER TABLE public.fro_station_assignments
  ADD COLUMN IF NOT EXISTS crm_agent_id uuid;

-- SET NULL, never CASCADE: retiring an agent must not delete the stations they
-- were working. The row falls back to showing its FRO of record.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fro_station_assignments_crm_agent_id_fkey'
  ) THEN
    ALTER TABLE public.fro_station_assignments
      ADD CONSTRAINT fro_station_assignments_crm_agent_id_fkey
      FOREIGN KEY (crm_agent_id) REFERENCES public.crm_agents(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fro_station_assignments_crm_agent_id
  ON fro_station_assignments (crm_agent_id);

-- Backfill from the worker mapping that was in force when this ran, so existing
-- stations immediately report the agent they were already being shown as.
-- crm_agents_worker_uniq guarantees at most one ACTIVE agent per worker, so this
-- cannot fan out onto a station more than once.
UPDATE public.fro_station_assignments s
   SET crm_agent_id = a.id
  FROM public.crm_agents a
 WHERE s.crm_agent_id IS NULL
   AND s.fro_worker_id IS NOT NULL
   AND a.worker_id = s.fro_worker_id
   AND a.is_active;