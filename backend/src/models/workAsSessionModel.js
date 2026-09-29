import db from '../config/db.js';
import { indexCovers, groupCoversByOperator } from '../utils/workAs.js';

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

// The same read in the other direction: which FROs is this operator covering?
//
// work_as_sessions is the authoritative many-to-many for cover relationships —
// one row per (operator, covered target) — so it can hold a chain, where the
// covered FRO is themself covering someone else. The single
// work_as_operator_id column on fro_live_status cannot: one slot per person,
// written by every heartbeat, so a person who is both covered and covering loses
// one of the two facts to whichever heartbeat lands last. Callers read covers
// from here and treat the live-row column as a display label only.
export const getActiveSessionsForOperator = async (operatorUserId) => {
  const { data, error } = await db
    .from('work_as_sessions')
    .select('target_fro_worker_id, operator_user_id, operator_name, stations')
    .eq('operator_user_id', String(operatorUserId))
    .is('released_at', null)
    .gt('expires_at', new Date().toISOString());
  if (error) throw error;
  return data || [];
};

// Batch form, for dashboards that need every cover in one pass. Returns
// target id -> the operator covering them. A target can be covered by several
// operators at once, so the value is a list; callers that only need "is anyone
// covering this person" should use indexCovers(...).isCovered.
export const getActiveCoversForTargets = async (targetWorkerIds) => {
  const ids = [...new Set((targetWorkerIds || []).map((v) => String(v ?? '')).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { data, error } = await db
    .from('work_as_sessions')
    .select('target_fro_worker_id, operator_user_id, operator_name')
    .in('target_fro_worker_id', ids)
    .is('released_at', null)
    .gt('expires_at', new Date().toISOString());
  if (error) throw error;
  return indexCovers(data || []);
};

// Batch form in the operator direction: which targets is each operator covering?
// Used by the admin boards to show presence and to decide whether a covered FRO
// who has gone quiet is away (freeze idle) or merely unrefreshed.
export const getActiveCoversByOperator = async (operatorUserIds) => {
  const ids = [...new Set((operatorUserIds || []).map((v) => String(v ?? '')).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { data, error } = await db
    .from('work_as_sessions')
    .select('target_fro_worker_id, operator_user_id, operator_name')
    .in('operator_user_id', ids)
    .is('released_at', null)
    .gt('expires_at', new Date().toISOString());
  if (error) throw error;
  return groupCoversByOperator(data || []);
};

// Clear the display label from every target this operator has just stopped
// covering.
//
// The label on fro_live_status is a cosmetic hint, but it is a hint with no
// expiry of its own: it is only cleared by that FRO's next heartbeat, by a
// release of the current session, or by a new cover overwriting it. So an
// operator who switched from one target to another left the FIRST target's row
// still branded "being worked by Priya" for as long as that FRO stayed logged
// out — a badge naming a cover that had ended. The boards prefer work_as_sessions
// and fall back to this column, so once the session is gone the stale label is
// the only thing left on screen.
//
// Best-effort: the session rows are the truth, so a failure here must not fail
// the switch.
export const clearOperatorCoverLabels = async (operatorUserId) => {
  const id = String(operatorUserId ?? '');
  if (!id) return 0;
  try {
    const sessions = await getActiveSessionsForOperator(id);
    const targetIds = [...new Set(sessions.map(s => String(s.target_fro_worker_id)).filter(Boolean))];
    if (targetIds.length === 0) return 0;
    // Only rows labelled with THIS operator — another operator may legitimately
    // be covering the same FRO, and that label is theirs, not ours to erase.
    const { error } = await db
      .from('fro_live_status')
      .update({ work_as_operator_id: null, work_as_operator_name: null })
      .in('worker_id', targetIds)
      .eq('work_as_operator_id', id);
    if (error) throw error;
    return targetIds.length;
  } catch (e) {
    return 0;
  }
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
    // Two advisory locks, taken in a fixed order so concurrent switches cannot
    // deadlock against each other.
    //
    // The target lock serialises claims on one FRO's stations. The OPERATOR lock
    // is what actually enforces "one cover at a time": the switch endpoint
    // releases the operator's previous sessions first, but that release and the
    // claim below are two separate requests, so a second browser (or a retry)
    // could slip a claim in between and leave one operator holding covers on two
    // FROs at once. That is not a state the boards, the idle freeze or the card
    // can represent — an operator has exactly one live row and one set of figures,
    // so covering two accounts silently splits their presence between them.
    // With the lock held across release-then-claim, the second attempt waits and
    // then finds the operator's earlier session already gone.
    await db._pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`work_as:${targetWorkerId}`]);
    await db._pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`work_as_op:${operatorUserId}`]);
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

    // One cover per operator. The switch endpoint releases this operator's
    // sessions before calling us, so finding one here means a concurrent switch
    // won the race — a second browser, or a retry landing between the other
    // request's release and its claim.
    //
    // Reject rather than silently supersede: this operator now has a live row, a
    // card and a single set of idle figures, and two open covers would split their
    // presence across both FROs with no way for the boards to show it. The
    // operator lock above means the loser waits and then sees this, instead of
    // both requests ending up holding a session.
    const { rows: operatorRows } = await db._pool.query(
      `SELECT DISTINCT target_fro_worker_id
         FROM work_as_sessions
        WHERE operator_user_id = $1
          AND released_at IS NULL
          AND expires_at > now()
          AND target_fro_worker_id <> $2::uuid
        LIMIT 1`,
      [String(operatorUserId), String(targetWorkerId)]
    );
    if (operatorRows?.length > 0) {
      return {
        ok: [],
        conflict: [{
          ngo_id: null,
          station: null,
          taken_by: 'you are already covering another FRO',
          reason: 'already_covering_another_fro',
        }],
      };
    }

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
