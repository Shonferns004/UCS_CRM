-- Attribute a FRO's ledger intervals to the agent who was at the keyboard.
--
-- WHY. fro_live_status, fro_time_sessions, fro_daily_stats and work_queue all
-- carry FOREIGN KEYs to workers(id), and a CRM agent has no workers row
-- (crm_agents.worker_id points at the FRO they cover). So an agent's time was
-- filed against the COVERED FRO, and the board showed the working and the idle
-- against someone who was never at their desk.
--
-- Stamping agent_id splits the day without adding rows to `workers`: readers take
-- unstamped intervals for the FRO and stamped ones for the agent. No foreign key
-- on purpose — an agent uuid does not exist in workers, which is the problem being
-- solved, so this is an attribution stamp rather than a referential claim. Adding
-- 55 workers rows instead would have leaked "CRM Agent" into the HR directory,
-- the daily attendance summary, birthdays/anniversaries, the salary workers
-- summary and the voting turnout denominator, none of which filter by department.
--
-- Partial indexes on both halves: only stamped rows are ever looked up by agent,
-- only unstamped by owner, so indexing every NULL would be overhead.
ALTER TABLE fro_time_sessions ADD COLUMN IF NOT EXISTS agent_id TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_fro_time_sessions_agent
  ON fro_time_sessions (agent_id, started_at)
  WHERE agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fro_time_sessions_worker_owner
  ON fro_time_sessions (worker_id, started_at)
  WHERE agent_id IS NULL;