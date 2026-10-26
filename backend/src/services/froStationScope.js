// Station scope for the FRO WhatsApp inbox.
//
// WHY THIS EXISTS
// ---------------
// The FRO inbox used to be scoped by WHATSAPP PROJECT (the Meta number the FRO
// happens to hold) and by thread owner. Every unclaimed thread on a number the
// FRO held was therefore visible to them - including threads belonging to
// donors who live in stations the FRO does not own.
//
// Station allocation is the CRM's ownership record ("this FRO owns these
// stations"), and the donor list the FRO works from is already scoped by it.
// The inbox has to agree with that list, or a FRO ends up answering for donors
// who are not theirs.
//
// THE JOIN CHAIN
// --------------
//   fro_station_assignments (station, ngo_id) -> fro_assignments (donor)
//     -> donor_profiles.mobile_number -> contacts.phone_normalized
//       -> conversations.contact_id
//
// A station name is only unique per NGO, so the pair (station, ngo_id) is
// what is matched - never the station name alone.
//
// PHONE MATCHING
// --------------
// donor_profiles.mobile_number is hand-authored off imported spreadsheets
// (10 digits, sometimes 91-prefixed, sometimes with separators) while
// contacts.phone_normalized is always digits-only. Both spellings are
// therefore compared: the raw stored number and the last ten digits.

import db from '../config/db.js';

// ── Identity ────────────────────────────────────────────────────────────

/**
 * Resolve a caller id to the workers.id whose stations define the scope.
 *
 * Two id domains reach the WhatsApp routes:
 *   - a FRO CRM login       -> id is workers.id
 *   - a WhatsApp agent token -> id is users.id (the agent login minted for
 *     that worker by get_worker_agents)
 *
 * worker_agent_assignments is the canonical users.id -> workers.id link and is
 * what every other scope resolver in this codebase already uses, so it is used
 * here too. Returns null when the caller is not a worker at all (a standalone
 * agent login with no worker behind it), which callers read as "no station
 * scope available" rather than "no access".
 */
export async function resolveScopeWorkerId(callerId) {
  if (!callerId) return null;
  const id = String(callerId).trim();
  if (!id) return null;

  try {
    const { data } = await db.from('workers').select('id').eq('id', id).maybeSingle();
    if (data?.id) return data.id;
  } catch { /* not a worker id - fall through */ }

  try {
    const { data } = await db
      .from('worker_agent_assignments')
      .select('worker_id')
      .eq('user_id', id)
      .limit(1)
      .maybeSingle();
    if (data?.worker_id) return data.worker_id;
  } catch { /* table may be unavailable - fall through */ }

  return null;
}

// ── Station pairs ───────────────────────────────────────────────────────

/**
 * The (station, ngo_id) pairs this worker owns.
 *
 * `restrictPairs` overrides the list (the work-as station scope): only the
 * pairs the acting session claimed are in scope then.
 */
export async function getFroStationPairs(workerId, restrictPairs = null) {
  if (Array.isArray(restrictPairs) && restrictPairs.length > 0) {
    return restrictPairs
      .map((p) => ({ station: String(p?.station ?? '').trim(), ngo_id: p?.ngo_id ?? null }))
      .filter((p) => p.station);
  }
  if (!workerId) return [];
  const { data, error } = await db
    .from('fro_station_assignments')
    .select('station, ngo_id')
    .eq('fro_worker_id', workerId);
  if (error) throw error;
  return (data || [])
    .map((r) => ({ station: String(r.station ?? '').trim(), ngo_id: r.ngo_id ?? null }))
    .filter((r) => r.station);
}

// ── Donor phones of a station scope ─────────────────────────────────────

/**
 * The last ten digits of every donor mobile sitting in the given stations.
 *
 * One query. The station filter rides on idx_fro_assignments_station and the
 * donor is reached by its primary key, so no expression index on
 * donor_profiles is needed here.
 *
 * A pair whose ngo_id is NULL is a "global" station: it matches the station
 * name in every NGO. A pair WITH an ngo_id only matches that NGO's rows.
 */
export async function getStationDonorPhones(pairs) {
  const list = (pairs || []).filter((p) => p?.station);
  if (list.length === 0) return new Set();

  const stations = list.map((p) => p.station);
  const ngoIds = list.map((p) => (p.ngo_id == null ? null : p.ngo_id));

  const { rows } = await db._pool.query(
    `WITH pairs AS (
       SELECT * FROM unnest($1::text[], $2::uuid[]) AS p(station, ngo_id)
     )
     SELECT DISTINCT dp.mobile_number
       FROM pairs p
       JOIN fro_assignments fa
         ON fa.station = p.station
        AND (p.ngo_id IS NULL OR fa.ngo_id = p.ngo_id)
        AND (fa.status IS NULL OR fa.status <> 'reassigned')
       JOIN donor_profiles dp ON dp.id = fa.donor_id
      WHERE dp.mobile_number IS NOT NULL
        AND dp.mobile_number <> ''`,
    [stations, ngoIds],
  );

  const phones = new Set();
  for (const r of rows || []) {
    const digits = String(r.mobile_number || '').replace(/\D/g, '');
    if (digits.length < 10) continue;
    phones.add(digits.slice(-10));
  }
  return phones;
}

// ── Conversation scope ──────────────────────────────────────────────────

/**
 * Conversation ids whose contact is a donor in the given stations.
 */
export async function getStationScopedConversationIds(pairs) {
  const phones = await getStationDonorPhones(pairs);
  if (phones.size === 0) return new Set();

  const { rows } = await db._pool.query(
    `SELECT cv.id
       FROM conversations cv
       JOIN contacts ct ON ct.id = cv.contact_id
      WHERE right(ct.phone_normalized, 10) = ANY($1::text[])`,
    [[...phones]],
  );
  return new Set((rows || []).map((r) => r.id));
}

/**
 * Is this single conversation inside the caller's station scope?
 *
 * Used by the per-conversation routes (open thread, reply, mark read) so a
 * conversation that is out of scope cannot be opened by guessing its id.
 */
export async function isConversationInStationScope(pairs, conversationId) {
  const list = (pairs || []).filter((p) => p?.station);
  if (list.length === 0 || !conversationId) return false;

  const { rows: convRows } = await db._pool.query(
    `SELECT ct.phone_normalized
       FROM conversations cv
       JOIN contacts ct ON ct.id = cv.contact_id
      WHERE cv.id = $1`,
    [conversationId],
  );
  const phone = convRows?.[0]?.phone_normalized;
  if (!phone) return false;

  const digits = String(phone).replace(/\D/g, '');
  const candidates = [...new Set([phone, digits, digits.slice(-10)].filter(Boolean))];

  const stations = list.map((p) => p.station);
  const ngoIds = list.map((p) => (p.ngo_id == null ? null : p.ngo_id));

  const { rows } = await db._pool.query(
    `WITH pairs AS (
       SELECT * FROM unnest($1::text[], $2::uuid[]) AS p(station, ngo_id)
     )
     SELECT 1
       FROM pairs p
       JOIN fro_assignments fa
         ON fa.station = p.station
        AND (p.ngo_id IS NULL OR fa.ngo_id = p.ngo_id)
        AND (fa.status IS NULL OR fa.status <> 'reassigned')
       JOIN donor_profiles dp ON dp.id = fa.donor_id
      WHERE dp.mobile_number = ANY($3::text[])
      LIMIT 1`,
    [stations, ngoIds, candidates],
  );
  return rows.length > 0;
}

/**
 * Derive allowed WhatsApp projects from station prefixes.
  * BOD/BFD -> bsct2 | AOD/AFD -> aflf2 | MOD/MFD -> mann 2
  *
  * Only the "2" numbers are mapped on purpose: the plain bsct / aflf / mann
  * inboxes must NOT be exposed by station assignment. A FRO may still reach a
  * plain number through an explicit WhatsApp Accounts grant or temp access;
  * this function only decides what the station itself carries.
  */
 export function getAllowedProjectsByStations(pairs) {
   const allowed = new Set();
   for (const p of pairs || []) {
     const st = String(p?.station || '').toUpperCase();
     if (!st) continue;
     const prefix = st.split('-')[0];
     if (['BOD', 'BFD'].includes(prefix)) {
       allowed.add('bsct2');
     } else if (['AOD', 'AFD'].includes(prefix)) {
       allowed.add('aflf2');
     } else if (['MOD', 'MFD'].includes(prefix)) {
       allowed.add('mann 2');
     }
   }
   return allowed;
 }

/**
 * The whole inbox scope for a WhatsApp caller.
 *
 * `hasStations` tells the caller whether station scoping could be applied at
 * all: a FRO with no allocated station has nothing to scope to, so the caller
 * keeps the older project-scoped behaviour instead of an empty inbox.
 */
export async function resolveInboxScope(callerId, { restrictPairs = null } = {}) {
  const workerId = await resolveScopeWorkerId(callerId);
  const pairs = workerId ? await getFroStationPairs(workerId, restrictPairs) : [];
  const stationConversationIds = pairs.length
    ? await getStationScopedConversationIds(pairs)
    : new Set();
  const allowedProjects = getAllowedProjectsByStations(pairs);
  return {
    workerId,
    pairs,
    hasStations: pairs.length > 0,
    stationConversationIds,
    allowedProjects,
  };
}
