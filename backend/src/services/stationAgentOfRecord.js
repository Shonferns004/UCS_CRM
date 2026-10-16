import db from '../config/db.js';

// Carries an agent's stations across a FRO reassignment.
//
// A station is a seat an agent occupies (fro_station_assignments.crm_agent_id).
// When that agent is handed a different FRO, two things have to move together
// or the pair starts lying:
//
//   - the station's fro_worker_id, so the station resolves to whoever the agent
//     now covers, and
//   - the donors already sitting in that station (fro_assignments.fro_worker_id),
//     which is what every read path -- donor lists, dashboards, search, credit,
//     salary -- actually resolves through.
//
// The station row keeps its agent of record, so "bod-3" still reads "Agent 1"
// after Mahima moves to Agent 3. What changes is whose account the station's
// data belongs to: it stops being Mahima's and becomes the new FRO's. Hand the
// seat to a different agent instead and use updateStationNgos, which re-points
// the same rows.
//
// Mirrors syncStationAgentToFro in ngoAdminController, deliberately including
// its original_fro_worker_id behaviour: the outgoing FRO is parked on the first
// change only, so a donor's first FRO survives for audit but can never outvote
// the agent of record afterwards.

const PARK_OUTGOING = `
  UPDATE fro_assignments
     SET original_fro_worker_id = fro_worker_id
   WHERE %SCOPE%
     AND original_fro_worker_id IS NULL
     AND status <> 'reassigned'
     AND fro_worker_id IS NOT NULL`;

const REPOINT = `
  UPDATE fro_assignments
     SET fro_worker_id = $1::uuid
   WHERE %SCOPE%
     AND status <> 'reassigned'`;

// ngo_id is nullable on a station row, so "same NGO" is a real branch rather than
// something a plain equality can express: `ngo_id = NULL` is never true. Both
// branches keep $2/$3 for the NGO id and station so one parameter array serves
// every query here.
const scope = (ngoId) => (ngoId
  ? `ngo_id = $2::uuid AND station = $3`
  : `ngo_id IS NULL AND station = $3`);

/**
 * @param {string} agentId             crm_agents.id whose stations follow it
 * @param {string} newWorkerId         the FRO this agent now covers
 * @param {string} [previousWorkerId]  the FRO it covered before, for the log line
 */
export async function carryAgentStationsToWorker(agentId, newWorkerId, previousWorkerId) {
  const result = { stations: 0, donors: 0 };
  if (!agentId || !newWorkerId) return result;

  const { rows: stations, error: stErr } = await db._pool.query(
    `SELECT id, station, ngo_id, fro_worker_id
       FROM fro_station_assignments
      WHERE crm_agent_id = $1`,
    [agentId],
  );
  if (stErr) throw stErr;
  result.stations = (stations || []).length;
  if (!stations?.length) return result;

  for (const s of stations) {
    const where = scope(s.ngo_id);
    const params = [newWorkerId, s.ngo_id, s.station];

    await db._pool.query(PARK_OUTGOING.replace('%SCOPE%', where), params);

    const { rowCount, error } = await db._pool.query(
      REPOINT.replace('%SCOPE%', where),
      params,
    );
    if (error) throw error;
    result.donors += rowCount || 0;
  }

  // The station row itself: agent of record untouched, worker follows the agent.
  const { error: upErr } = await db._pool.query(
    `UPDATE fro_station_assignments
        SET fro_worker_id = $1::uuid, updated_at = now()
      WHERE crm_agent_id = $2`,
    [newWorkerId, agentId],
  );
  if (upErr) throw upErr;

  console.log(
    `[agent stations] agent ${agentId} moved from worker ${previousWorkerId || 'none'} `
    + `to ${newWorkerId}: ${result.stations} station(s), ${result.donors} donor row(s) re-pointed`,
  );
  return result;
}