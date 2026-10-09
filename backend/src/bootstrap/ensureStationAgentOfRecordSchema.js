import db from '../config/db.js';

// Agent of record for a station.
//
// Why this exists: a station used to remember only WHICH FRO sat in it, and
// every read path derived the agent by asking "which agent covers this worker
// right now" (displayFroName in ngoAdminController). That made a station belong
// to a PERSON rather than to a SEAT. Reassign the FRO -- Agent 1's Mahima
// becomes Agent 3's Mahima -- and every one of that agent's stations silently
// changed owner on the station page, with no edit having been made to them.
//
// A station is a seat an agent occupies, and the agent is what must be stored.
// `crm_agent_id` is that record; `fro_worker_id` is kept in step with whichever
// FRO the agent currently covers, so the ~70 existing readers (donor lists,
// dashboards, salary, search, credit) keep resolving through
// fro_assignments.fro_worker_id without being rewritten.
//
// Migrations are not auto-run, so this repairs itself on boot with the same
// ADD COLUMN IF NOT EXISTS approach as ensureTicketSchema/ensureSevakRenewalSchema.

const STEPS = [
  `ALTER TABLE public.fro_station_assignments
     ADD COLUMN IF NOT EXISTS crm_agent_id uuid`,
  // SET NULL, never CASCADE: retiring an agent must not delete the stations
  // they were working, and the row falls back to showing the FRO of record.
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'fro_station_assignments_crm_agent_id_fkey'
     ) THEN
       ALTER TABLE public.fro_station_assignments
         ADD CONSTRAINT fro_station_assignments_crm_agent_id_fkey
         FOREIGN KEY (crm_agent_id) REFERENCES public.crm_agents(id) ON DELETE SET NULL;
     END IF;
   END $$`,
  `CREATE INDEX IF NOT EXISTS idx_fro_station_assignments_crm_agent_id
     ON fro_station_assignments (crm_agent_id)`,
  // Backfill, which is the whole point: seed the agent of record from the
  // worker mapping that was in force when this ran. crm_agents_worker_uniq
  // guarantees at most one ACTIVE agent per worker, so this cannot fan out --
  // but it is scoped to is_active for the same reason the display lookup was.
  `UPDATE public.fro_station_assignments s
      SET crm_agent_id = a.id
     FROM public.crm_agents a
    WHERE s.crm_agent_id IS NULL
      AND s.fro_worker_id IS NOT NULL
      AND a.worker_id = s.fro_worker_id
      AND a.is_active`,
];

async function tableExists(name) {
  const r = await db._pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [name],
  );
  return r.rows.length > 0;
}

export async function ensureStationAgentOfRecordSchema() {
  if (!(await tableExists('fro_station_assignments'))) return;
  if (!(await tableExists('crm_agents'))) return;

  for (const sqlText of STEPS) {
    try {
      await db._pool.query(sqlText);
    } catch (e) {
      // Lost a race with a parallel boot, or the role cannot ALTER. Not fatal:
      // the column is additive, and the station page falls back to the
      // worker-derived agent when it is absent.
      console.warn('[station agent schema] skip:', e?.message || String(e));
    }
  }
}