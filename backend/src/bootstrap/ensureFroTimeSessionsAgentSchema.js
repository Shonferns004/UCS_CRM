import db from '../config/db.js';

// fro_time_sessions gains an agent stamp.
//
// WHY THIS EXISTS. Every time table is keyed to workers(id) — fro_live_status,
// fro_time_sessions, fro_daily_stats and work_queue all carry that foreign key —
// and a CRM agent has no workers row; crm_agents.worker_id points at the FRO they
// cover. That is why an agent's time has always been filed against the COVERED
// FRO: the alternative was writing an agent uuid into a workers-keyed column and
// failing the heartbeat outright. The consequence is visible on the board — while
// an agent works a FRO's queue, the working and the idle both land on the FRO who
// was never at the keyboard.
//
// This column breaks that tie WITHOUT touching workers. The interval still keys
// on the covered FRO, so every existing reader keeps working untouched and no
// shared table gains phantom people (the HR directory, attendance summary,
// birthdays, salary summary and voting turnout all read `workers` unfiltered and
// would each have grown by 55 rows). It simply records WHO was at the keyboard,
// so a reader can split the day: the FRO's own figures come from intervals with
// no agent stamp, the agent's from the stamped ones.
//
// Deliberately NOT a foreign key, and text rather than uuid: an agent uuid does
// not exist in workers, which is the entire problem being solved here. It is an
// attribution stamp, not a referential claim. Reruns safely on every boot via
// ADD COLUMN IF NOT EXISTS.
//
// The index is partial on purpose: only stamped rows are ever looked up by agent,
// and only unstamped rows by owner, so indexing all NULLs would be pure overhead.
export async function ensureFroTimeSessionsAgentSchema() {
  try {
    await db._pool.query(`ALTER TABLE fro_time_sessions ADD COLUMN IF NOT EXISTS agent_id TEXT NULL`);
    await db._pool.query(
      `CREATE INDEX IF NOT EXISTS idx_fro_time_sessions_agent
         ON fro_time_sessions (agent_id, started_at)
       WHERE agent_id IS NOT NULL`
    );
    await db._pool.query(
      `CREATE INDEX IF NOT EXISTS idx_fro_time_sessions_worker_owner
         ON fro_time_sessions (worker_id, started_at)
       WHERE agent_id IS NULL`
    );
  } catch (error) {
    throw error;
  }
}

export default ensureFroTimeSessionsAgentSchema;