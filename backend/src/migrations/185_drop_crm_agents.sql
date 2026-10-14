-- 185: drop the CRM login Agents feature (crm_agents) and its schema residue.
--
-- The feature is removed from the code in the same release: crmAgentModel.js,
-- crmAgentsController.js, stationAgentOfRecord.js,
-- ensureStationAgentOfRecordSchema.js and ensureFroTimeSessionsAgentSchema.js
-- are deleted, and every reader that filtered, grouped or attributed by agent
-- is gone. Migrations are not auto-run in this deployment, so this file is run
-- by hand AFTER that code is deployed.
--
-- ORDER MATTERS, twice over:
--   - steps 1-4 still READ crm_agents, so the feature tables are dropped last
--     (step 6);
--   - the receipt rewrite (step 1) reads worker_aliases, so the "Agent %"
--     alias rows are deleted after it and not before.

BEGIN;

-- ─── 1. receipts.agent_name: "Agent N" -> the FRO the agent worked for ──────
--
-- agent_name is what collection reports group by, and pre-dates the feature as
-- the name of whoever was at the keyboard. A switched agent session stamped its
-- label there (imposter_name = "Agent 2"), which resolved back to one FRO only
-- through worker_aliases. With both gone the value would stop resolving and the
-- money would drop out of every collection total, so write it to the FRO's own
-- name — the figure totals had before the feature existed.
UPDATE receipts r
   SET agent_name = w.name
  FROM crm_agents a
  JOIN workers w ON w.id = a.worker_id
 WHERE r.agent_name = a.label
   AND w.name IS NOT NULL;

-- A label whose crm_agents row is already gone (agent deleted before this
-- migration) still has the worker_aliases row it was created with. Rewrite from
-- there while those rows are still present.
UPDATE receipts r
   SET agent_name = w.name
  FROM worker_aliases wa
  JOIN workers w ON w.id = wa.worker_id
 WHERE r.agent_name = wa.alias_name
   AND wa.alias_name LIKE 'Agent %'
   AND w.name IS NOT NULL;

-- What is left could not be tied to an FRO (agent created before one was
-- assigned, or a label edited out from under the receipt). NULL is the
-- pre-existing "attributed to nobody" state; an unresolvable "Agent N" would
-- otherwise sit in its own dead bucket forever. Category labels (suspense, pg,
-- library, na) do not match this pattern.
UPDATE receipts
   SET agent_name = NULL
 WHERE agent_name LIKE 'Agent %';

-- The aliases existed only to resolve those labels back to the FRO. Nothing
-- reads them for 'Agent %' after the rewrite above.
-- worker_aliases.alias_name is unique on lower(alias_name).
DELETE FROM worker_aliases WHERE alias_name LIKE 'Agent %';

-- ─── 2. fro_donor_logs.operator_id: the ACTOR stamped on a claim ────────────
--
-- operator_id has no FK by design (182): it spans workers (a manual cover) and
-- users (an admin). A switched agent's session wrote the agent's crm_agents
-- uuid there too — creditWorkerId is the JWT's imposter_id. Once crm_agents is
-- gone that id resolves to nobody, and the claim disappears from the "credit"
-- half of the Verified / Unverified cards, which match operator_id explicitly
-- while the own-row half requires operator_id IS NULL. Point the id at the FRO
-- the agent worked for: that is whose credit it already was (resolveCreditTarget
-- resolved the agent uuid through crm_agents.worker_id).
UPDATE fro_donor_logs l
   SET operator_id = a.worker_id
  FROM crm_agents a
 WHERE l.operator_id = a.id
   AND a.worker_id IS NOT NULL;

-- No FRO to point at (173 allows an agent before one is assigned): fold the
-- claim into the covered FRO's own rows — operator_id NULL plus fro_worker_id
-- is exactly how a claim made by the FRO themself reads.
UPDATE fro_donor_logs l
   SET operator_id = NULL
  FROM crm_agents a
 WHERE l.operator_id = a.id;

-- ─── 3. Cover residue ───────────────────────────────────────────────────────
--
-- work_as_sessions.operator_user_id is text (084_work_as_sessions.sql);
-- fro_live_status.work_as_operator_id is uuid (ensureFroLiveStatusSchema.js).
-- Agent rows are stale covers at this point (sessions have a 2h TTL), and
-- deleting them also releases any station claim they still hold.
DELETE FROM work_as_sessions
 WHERE operator_user_id IN (SELECT id::text FROM crm_agents)
    OR operator_name LIKE 'Agent %';

UPDATE fro_live_status
   SET work_as_operator_id = NULL,
       work_as_operator_name = NULL
 WHERE work_as_operator_id IN (SELECT id FROM crm_agents);

-- The label is cosmetic, but it was written beside the id above; clear any
-- stragglers so no board still says a station is being worked by "Agent 2".
UPDATE fro_live_status
   SET work_as_operator_name = NULL
 WHERE work_as_operator_name LIKE 'Agent %';

-- ─── 4. Station agent-of-record (181 / ensureStationAgentOfRecordSchema.js) ──
--
-- SET NULL on delete, so the constraint can go before the column it guards.
ALTER TABLE fro_station_assignments
  DROP CONSTRAINT IF EXISTS fro_station_assignments_crm_agent_id_fkey;
DROP INDEX IF EXISTS idx_fro_station_assignments_crm_agent_id;
ALTER TABLE fro_station_assignments DROP COLUMN IF EXISTS crm_agent_id;

-- ─── 5. Time-ledger agent stamp (ensureFroTimeSessionsAgentSchema.js) ───────
--
-- The intervals stay: they always keyed on the covered FRO, so with the stamp
-- gone they read as the FRO's own time again, which is what every pre-feature
-- reader expects.
DROP INDEX IF EXISTS idx_fro_time_sessions_agent;
-- Partial on `WHERE agent_id IS NULL`, so it goes with the column. It is NOT
-- recreated in non-partial form: idx_fro_time_sessions_worker_started from 171
-- — (worker_id, started_at DESC) — predates the feature, was never dropped, and
-- covers the same reads.
DROP INDEX IF EXISTS idx_fro_time_sessions_worker_owner;
ALTER TABLE fro_time_sessions DROP COLUMN IF EXISTS agent_id;

-- ─── 6. Feature tables, last ────────────────────────────────────────────────
--
-- CASCADE is belt-and-braces: the only FK referencing crm_agents in this repo
-- is fro_station_assignments.crm_agent_id, dropped in step 4.
DROP TABLE IF EXISTS crm_agents CASCADE;
DROP TABLE IF EXISTS crm_agent_sequence CASCADE;

COMMIT;
