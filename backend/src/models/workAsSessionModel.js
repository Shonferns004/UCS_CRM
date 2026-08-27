import db from '../config/db.js';

const TTL_HOURS = 2;
const pairKey = (p) => `${p?.ngo_id ?? ''}|${String(p?.station ?? '').trim()}`;

// A session is active while it has not been released and has not expired.
export const releaseOperatorSessions = async (operatorUserId) => {
  const { data, error } = await db
    .from('work_as_sessions')
    .update({ released_at: new Date().toISOString() })
    .eq('operator_user_id', String(operatorUserId ?? ''))
    .is('released_at', null)
    .select('id');
  if (error) throw error;
  return (data || []).length;
};

export const getActiveSessionsForTarget = async (targetWorkerId) => {
  const { data, error } = await db
    .from('work_as_sessions')
    .select('operator_user_id, operator_name, stations')
    .eq('target_fro_worker_id', String(targetWorkerId))
    .is('released_at', null)
    .gt('expires_at', new Date().toISOString());
  if (error) throw error;
  return data || [];
};

// Claim (ngo_id, station) pairs for an operator acting as targetWorkerId.
// Runs inside a transaction guarded by an advisory lock keyed to the target,
// so two operators racing for the same station cannot both win: the loser gets
// a conflict list naming the holders instead of a silent double-claim.
// Returns { ok: [...], conflict: [...] } — ok holds the claimed pairs.
export const claimStations = async ({ targetWorkerId, pairs, operatorUserId, operatorName }) => {
  const wanted = new Map();
  for (const p of pairs || []) {
    if (!p || p.station == null) continue;
    wanted.set(pairKey(p), { ngo_id: p.ngo_id ?? null, station: String(p.station).trim() });
  }
  if (wanted.size === 0) return { ok: [], conflict: [] };

  return db.transaction(async () => {
    await db._pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`work_as:${targetWorkerId}`]);
    const { rows } = await db._pool.query(
      `SELECT operator_user_id, operator_name, stations
         FROM work_as_sessions
        WHERE target_fro_worker_id = $1
          AND released_at IS NULL
          AND expires_at > now()`,
      [String(targetWorkerId)]
    );

    const conflicts = [];
    for (const row of rows || []) {
      if (String(row.operator_user_id) === String(operatorUserId)) continue;
      for (const s of row.stations || []) {
        if (!wanted.has(pairKey(s))) continue;
        conflicts.push({ ngo_id: s.ngo_id ?? null, station: s.station, taken_by: row.operator_name || 'another operator' });
      }
    }
    if (conflicts.length > 0) return { ok: [], conflict: conflicts };

    const claimed = [...wanted.values()];
    const { data: created, error } = await db
      .from('work_as_sessions')
      .insert({
        target_fro_worker_id: String(targetWorkerId),
        operator_user_id: String(operatorUserId),
        operator_name: operatorName || null,
        stations: JSON.stringify(claimed),
        expires_at: new Date(Date.now() + TTL_HOURS * 3600 * 1000).toISOString(),
      })
      .select('id, expires_at')
      .single();
    if (error) throw error;
    return { ok: claimed, conflict: [], session: created };
  });
};
