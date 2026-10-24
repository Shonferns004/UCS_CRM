import db from '../config/db.js';
import { cacheGet, cacheSet, cacheDelPrefix } from '../utils/ttlCache.js';

// ─── Temporary Data Access — backend authorization ───────────────────────────
//
// A permission LAYER, not an ownership change. Permanent ownership lives in
// fro_station_assignments (the station's fro_worker_id) and fro_assignments
// (per-donor rows). This service only ever answers "is this worker authorized
// to work on THIS donor's data RIGHT NOW?" using temporary_data_assignments.
// It never writes to those ownership tables.
//
// Three identities stay separate:
//   • owner   — fro_assignments.fro_worker_id / the station's fro_worker_id
//               (never modified because of a temporary grant)
//   • worker  — the authenticated session (req.user.id); what logs record
//               as collector under temp access, since there is NO identity
//               swap (unlike work-as, which mints a painted token)
//   • admin   — who granted the access (granted_by_admin_id)
//
// Rollout note: the TEMP_DATA_ACCESS_ENABLED gate was removed — the feature is
// always on. Authorization itself is unchanged: it fails CLOSED on any lookup
// error (see getActiveGrants), so removing the flag only removed the ability
// to take the whole layer dark.

const GRANT_CACHE_TTL_MS = 15 * 1000;
const GRANT_CACHE_PREFIX = 'tda:grants:';

// ─── Active grants for a worker ──────────────────────────────────────────────
//
// Cached briefly to keep the My Leads hot path cheap (getMyStationScope runs
// on every donor-list load), BUT the time window is re-evaluated from the
// cached row's own starts_at/expires_at on every use — so a cached row can
// never authorize access one millisecond past expires_at (Scenario D).
// Revocation/extension invalidates the key explicitly, so a revoke takes
// effect on the very next request even inside the TTL (Scenario D/revocation).
//
// Status handling without a sweeper: a grant is live when its status is
// SCHEDULED or ACTIVE AND now falls inside the window. EXPIRED is a derived
// label for display; REVOKED/CANCELLED are explicit and deny immediately.

// Exported for unit tests (window boundary rules are the security-critical
// part: a grant must deny at exactly expires_at, not a second later).
export function isWindowLive(grant, now = Date.now()) {
  const starts = grant.starts_at ? new Date(grant.starts_at).getTime() : 0;
  const expires = grant.expires_at ? new Date(grant.expires_at).getTime() : Infinity;
  return now >= starts && now < expires;
}

export async function getActiveGrants(workerId) {
  if (!workerId) return [];
  const cacheKey = `${GRANT_CACHE_PREFIX}${workerId}`;
  let rows = cacheGet(cacheKey, GRANT_CACHE_TTL_MS);
  if (rows === undefined) {
    try {
      const { rows: dbRows, error } = await db._pool.query(
        `SELECT id, ngo_id, station, scope_type, starts_at, expires_at, status,
            allowed_count, allowed_offset, allowed_assignment_ids
           FROM temporary_data_assignments
          WHERE working_fro_worker_id = $1
            AND status IN ('SCHEDULED', 'ACTIVE')`,
        [workerId],
      );
      if (error) throw new Error(error.message);
      rows = dbRows || [];
      cacheSet(cacheKey, rows);
    } catch (e) {
      // Fail CLOSED for the temp layer: no cache, no grants. Permanent access
      // does not flow through here, so a DB blip never locks an FRO out of
      // their own station — it only suspends the extra layer.
      console.warn('[temp access] grant lookup failed:', e?.message || String(e));
      return [];
    }
  }
  const now = Date.now();
  return rows.filter(g => isWindowLive(g, now));
}

/** Live grants as (station, ngo_id) pairs — the unit getMyStationScope unions. */
export async function getActiveGrantPairs(workerId) {
  const grants = await getActiveGrants(workerId);
  return grants.map(g => ({ station: String(g.station).trim(), ngo_id: g.ngo_id }));
}

/**
 * For a temp grant with slice control (allowed_count set), return the list of
 * fro_assignments.id that this grantee may work. null = no restriction (all
 * rows on that station+tier). Cached per grant id.
 */
const SLICE_CACHE_PREFIX = 'tda:slice:';
const SLICE_CACHE_TTL_MS = 15 * 1000;
export async function getAllowedAssignmentIds(grant) {
  if (!grant) return null;
  // Explicit list (stack-based) takes precedence over offset window.
  if (Array.isArray(grant.allowed_assignment_ids) && grant.allowed_assignment_ids.length > 0) {
    return grant.allowed_assignment_ids;
  }
  if (grant.allowed_count == null) return null;
  const cacheKey = `${SLICE_CACHE_PREFIX}${grant.id}`;
  let ids = cacheGet(cacheKey, SLICE_CACHE_TTL_MS);
  if (ids === undefined) {
    try {
      const { rows, error } = await db._pool.query(
        `SELECT id FROM fro_assignments
          WHERE station = $1
            AND batch_type = 'high_tier'
            AND (status IS NULL OR status <> 'reassigned')
          ORDER BY id ASC
          LIMIT $2 OFFSET $3`,
        [grant.station, grant.allowed_count, grant.allowed_offset || 0],
      );
      if (error) throw new Error(error.message);
      ids = (rows || []).map(r => r.id);
      cacheSet(cacheKey, ids);
    } catch (e) {
      console.warn('[temp access] slice lookup failed:', e?.message || String(e));
      return [];
    }
  }
  return ids;
}

/** Call after any grant create/extend/revoke so the worker's next request re-reads. */
export function invalidateGrantCache(workerId) {
  if (workerId) cacheDelPrefix(`${GRANT_CACHE_PREFIX}${workerId}`);
  else cacheDelPrefix(GRANT_CACHE_PREFIX);
}

// ─── Donor resolution ────────────────────────────────────────────────────────
//
// The donor's CURRENT (station, ngo_id) comes from its non-reassigned
// fro_assignments row — canonical, always re-read. Never trust a station the
// client sends. A donor who moved stations is re-checked against the new
// station; a donor with no live row resolves to nothing → deny.

export async function getDonorActiveAssignments(donorId) {
  try {
    const { rows, error } = await db._pool.query(
      `SELECT id, station, ngo_id, status, fro_worker_id
         FROM fro_assignments
        WHERE donor_id = $1
          AND (status IS NULL OR (status IS NULL OR status <> 'reassigned'))`,
      [donorId],
    );
    if (error) throw new Error(error.message);
    return rows || [];
  } catch (e) {
    console.warn('[temp access] donor assignment lookup failed:', e?.message || String(e));
    return null; // null = indeterminate (vs [] = definitely no live row)
  }
}

// Exported for unit tests: pair matching is where a station/NGO mismatch bug
// would silently widen access, so it gets pinned directly.
export function pairKey(station, ngoId) {
  return `${ngoId ?? ''}|${String(station ?? '').trim()}`;
}

// ─── The authorization decision ──────────────────────────────────────────────
//
// Allowed when EITHER rule permits it:
//   1. permanent — the worker owns the donor's assignment row, or the row's
//      (station, ngo) is the worker's permanent station (existing behavior,
//      unchanged);
//   2. temporary — an active, in-window temporary_data_assignments row covers
//      the donor's CURRENT (station, ngo) exactly.
//
// Deny-by-default: no live donor row, indeterminate lookup, expired or
// revoked grant, station/NGO mismatch → not allowed. Action is reserved for
// future per-action policies (v1: all granted actions are equal).

export async function canAccessDonorData(userId, donorId, action = 'read', context = {}) {
  if (!userId || !donorId) return { allowed: false, reason: 'missing_identity' };

  const assignments = await getDonorActiveAssignments(donorId);
  if (assignments === null) return { allowed: false, reason: 'indeterminate' };
  if (!assignments || assignments.length === 0) {
    return { allowed: false, reason: 'donor_not_active' };
  }

  // Rule 1 — permanent: ownership or permanent station membership.
  // Same query shape the existing scope builder uses (fro_station_assignments).
  try {
    const { rows: stations, error } = await db._pool.query(
      `SELECT station, ngo_id FROM fro_station_assignments WHERE fro_worker_id = $1`,
      [userId],
    );
    if (error) throw new Error(error.message);
    const permanent = new Set((stations || []).map(s => pairKey(s.station, s.ngo_id)));
    for (const a of assignments) {
      if (a.fro_worker_id && String(a.fro_worker_id) === String(userId)) {
        return { allowed: true, rule: 'owner' };
      }
      if (permanent.has(pairKey(a.station, a.ngo_id))) {
        return { allowed: true, rule: 'permanent_station' };
      }
    }
  } catch (e) {
    console.warn('[temp access] permanent check failed:', e?.message || String(e));
    // fall through to the temp rule; deny at the end if it also fails
  }

  // Rule 2 — temporary: a live grant covering the donor's current pair exactly.
  // A grant for station A never authorizes station B.
  const grants = await getActiveGrants(userId);
  if (grants.length > 0) {
    const granted = new Set(grants.map(g => pairKey(g.station, g.ngo_id)));
    for (const a of assignments) {
      if (granted.has(pairKey(a.station, a.ngo_id))) {
        return { allowed: true, rule: 'temporary', grantId: grants.find(
          g => pairKey(g.station, g.ngo_id) === pairKey(a.station, a.ngo_id),
        )?.id };
      }
    }
  }

  return { allowed: false, reason: 'no_authorization' };
}

// Synchronous shape for handlers that already resolved the assignment row
// (avoids a second donor lookup on hot write paths).
export function canWorkAssignment(userId, assignment, grants) {
  if (!userId || !assignment) return false;
  if (assignment.fro_worker_id && String(assignment.fro_worker_id) === String(userId)) return true;
  if (!grants || grants.length === 0) return false;
  const key = pairKey(assignment.station, assignment.ngo_id);
  return grants.some(g => {
    if (pairKey(g.station, g.ngo_id) !== key) return false;
    const scope = g.scope_type || 'STATION_ALL';
    if (scope === 'STATION_ALL') return true;
    const isHighTier = assignment.batch_type === 'high_tier';
    if (scope === 'STATION_HIGH_TIER') return isHighTier;
    if (scope === 'STATION_NORMAL') return !isHighTier;
    return false;
  });
}

// ─── Audit ───────────────────────────────────────────────────────────────────
// Append-only. Never throws into the caller's flow: a failed audit write must
// not abort the admin action it describes, but it is logged loudly.
export async function recordAssignmentEvent({
  assignmentId,
  eventType,
  actorAdminId = null,
  actorRole = null,
  previousState = null,
  newState = null,
  reason = null,
}) {
  if (!assignmentId || !eventType) return;
  try {
    await db._pool.query(
      `INSERT INTO temporary_data_assignment_events
         (assignment_id, event_type, actor_admin_id, actor_role, previous_state, new_state, reason)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
      [
        assignmentId,
        eventType,
        actorAdminId,
        actorRole,
        previousState ? JSON.stringify(previousState) : null,
        newState ? JSON.stringify(newState) : null,
        reason,
      ],
    );
  } catch (e) {
    console.error('[temp access] audit write failed:', e?.message || String(e));
  }
}
