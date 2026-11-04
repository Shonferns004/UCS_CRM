// Who may open a station's WhatsApp?
//
// `fro_station_assignments` carries two owner columns:
//   fro_worker_id  the FRO the seat is assigned to (the column every station edit updates)
//   crm_agent_id   the agent of record, seeded once at bootstrap and NOT updated by
//                  upsertStationAssignment when the FRO changes
//
// So the direct worker is authoritative. The agent is only the fallback for a row that
// names an agent login and no worker. Treating a stale agent as a second owner gave
// FROs other stations' WhatsApp tabs: e.g. Shravani's AOD-12 row was fine, while the
// BFD-12 row (owned by Sonali) still carried Shravani's old agent and opened BFD-12 too.

/**
 * Does this station-assignment row belong to `workerId`?
 *
 * @param {{ fro_worker_id?: string|null, crm_agent_id?: string|null }} row
 * @param {string} workerId
 * @param {Set<string>|Iterable<string>} agentIds agent logins belonging to that worker
 */
export function assignmentBelongsToWorker(row, workerId, agentIds) {
  if (!row || !workerId) return false;
  if (row.fro_worker_id) return row.fro_worker_id === workerId;
  if (!row.crm_agent_id) return false;
  return agentIds instanceof Set ? agentIds.has(row.crm_agent_id) : [...agentIds].includes(row.crm_agent_id);
}
