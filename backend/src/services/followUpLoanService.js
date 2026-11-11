import db from '../config/db.js';
import { cacheGet, cacheSet, cacheDelPrefix } from '../utils/ttlCache.js';

// ─── Follow-up / Callback Loans — authorization + visibility ─────────────────
//
// A loan lets the TARGET station's FRO work the SOURCE station's open
// follow-up / callback leads for a bounded window. Ownership in
// fro_assignments is never touched: source rows keep their station and
// fro_worker_id. This service only answers "which assignment ids may this
// worker see/handle right now as borrowed leads, and which of their own leads
// are lent out?".
//
// Two directions, one query:
//   • loanedIn  — items this worker may work (target side)
//   • loanedOut — items this worker's station lent away (source side)
//
// Cached briefly per worker because every Follow Ups / Callbacks / Overdue /
// queue load calls it. The window is re-evaluated against the cached row on
// every read, exactly like temporary access, so a cached set can never
// authorize work after expires_at.

const LOAN_CACHE_PREFIX = 'fll:worker:';
const LOAN_CACHE_TTL_MS = 15 * 1000;

export function isFollowUpLoansEnabled() {
  // Enabled unless explicitly switched off. Keeping the default on means a test
  // environment needs no extra env var; setting FOLLOWUP_LOANS_ENABLED=false is
  // the production kill switch.
  return String(process.env.FOLLOWUP_LOANS_ENABLED ?? 'true').toLowerCase() !== 'false';
}

/** Display status derived from the stored status + window (no sweeper needed). */
export function deriveLoanStatus(row, now = Date.now()) {
  if (!row) return 'EXPIRED';
  if (row.status === 'REVOKED' || row.status === 'RETURNED') return row.status;
  const starts = row.starts_at ? new Date(row.starts_at).getTime() : 0;
  const expires = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (!Number.isFinite(expires) || now >= expires) return 'EXPIRED';
  if (now < starts) return 'SCHEDULED';
  return 'ACTIVE';
}

/** True only inside [starts_at, expires_at). Exported for unit tests. */
export function isLoanWindowLive(row, now = Date.now()) {
  if (!row) return false;
  const starts = row.starts_at ? new Date(row.starts_at).getTime() : 0;
  const expires = row.expires_at ? new Date(row.expires_at).getTime() : Infinity;
  return now >= starts && now < expires;
}

function emptySets() {
  return { inIds: new Set(), outIds: new Set(), inMap: new Map(), outMap: new Map() };
}

function buildSets(rows) {
  const sets = emptySets();
  for (const r of rows || []) {
    const item = {
      loanId: r.loan_id,
      assignmentId: r.assignment_id,
      sourceStation: r.source_station,
      targetStation: r.target_station,
      startsAt: r.starts_at,
      expiresAt: r.expires_at,
      scope: r.scope,
    };
    if (r.direction === 'in') {
      sets.inIds.add(Number(r.assignment_id));
      sets.inMap.set(Number(r.assignment_id), item);
    } else {
      sets.outIds.add(Number(r.assignment_id));
      sets.outMap.set(Number(r.assignment_id), item);
    }
  }
  return sets;
}

/**
 * Live loan sets for one worker. Fails CLOSED for borrowed access: on a lookup
 * error the worker sees no loaned-in rows. The source side also fails closed
 * (returns no outIds) so a database blip never hides a worker's own leads.
 */
export async function getLoanSets(workerId) {
  if (!isFollowUpLoansEnabled() || !workerId) return emptySets();
  const key = `${LOAN_CACHE_PREFIX}${workerId}`;
  const cached = cacheGet(key, LOAN_CACHE_TTL_MS);
  if (cached !== undefined) return cached;

  try {
    const { rows, error } = await db._pool.query(
      `SELECT li.assignment_id,
              l.id AS loan_id,
              l.source_station,
              l.target_station,
              l.starts_at,
              l.expires_at,
              l.scope,
              CASE WHEN l.target_fro_worker_id = $1 THEN 'in' ELSE 'out' END AS direction
         FROM followup_loan_items li
         JOIN followup_loans l ON l.id = li.loan_id
        WHERE li.returned_at IS NULL
          AND l.status IN ('SCHEDULED', 'ACTIVE')
          AND now() >= l.starts_at
          AND now() < l.expires_at
          AND (l.target_fro_worker_id = $1 OR l.source_fro_worker_id = $1)`,
      [workerId],
    );
    if (error) throw new Error(error.message);
    const sets = buildSets(rows);
    cacheSet(key, sets);
    return sets;
  } catch (e) {
    console.warn('[follow-up loans] lookup failed:', e?.message || String(e));
    return emptySets();
  }
}

export async function getLoanedInAssignmentIds(workerId) {
  const sets = await getLoanSets(workerId);
  return [...sets.inIds];
}

export async function getLoanedOutAssignmentIds(workerId) {
  const sets = await getLoanSets(workerId);
  return [...sets.outIds];
}

export async function getLoanedInMap(workerId) {
  return (await getLoanSets(workerId)).inMap;
}

export async function getLoanedOutMap(workerId) {
  return (await getLoanSets(workerId)).outMap;
}

export async function isLoanedTo(workerId, assignmentId) {
  if (!workerId || assignmentId == null) return false;
  const sets = await getLoanSets(workerId);
  return sets.inIds.has(Number(assignmentId));
}

export async function isLoanedOut(workerId, assignmentId) {
  if (!workerId || assignmentId == null) return false;
  const sets = await getLoanSets(workerId);
  return sets.outIds.has(Number(assignmentId));
}

export function invalidateLoanCache(workerId) {
  if (workerId) cacheDelPrefix(`${LOAN_CACHE_PREFIX}${workerId}`);
  else cacheDelPrefix(LOAN_CACHE_PREFIX);
}

/** Append-only lifecycle audit. Never throws into the caller's flow. */
export async function recordLoanEvent({
  loanId,
  eventType,
  actorAdminId = null,
  actorRole = null,
  previousState = null,
  newState = null,
  reason = null,
}) {
  if (!loanId || !eventType) return;
  try {
    await db._pool.query(
      `INSERT INTO followup_loan_events
         (loan_id, event_type, actor_admin_id, actor_role, previous_state, new_state, reason)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
      [
        loanId,
        eventType,
        actorAdminId,
        actorRole,
        previousState ? JSON.stringify(previousState) : null,
        newState ? JSON.stringify(newState) : null,
        reason,
      ],
    );
  } catch (e) {
    console.error('[follow-up loans] audit write failed:', e?.message || String(e));
  }
}

/**
 * Idempotent sweep:
 *   1. stamp returned_at on items whose loan is over (window or explicit close);
 *   2. flip SCHEDULED -> ACTIVE inside the window;
 *   3. flip elapsed rows to EXPIRED.
 * Read paths already honour the window, so this job only keeps the stored state
 * (and the partial unique index) in step. Safe to call on every create.
 */
export async function closeExpiredLoans() {
  if (!isFollowUpLoansEnabled()) return 0;
  try {
    const { rows: closed } = await db._pool.query(
      `UPDATE followup_loans
          SET status = 'EXPIRED', updated_at = now()
        WHERE status IN ('SCHEDULED', 'ACTIVE')
          AND expires_at <= now()
        RETURNING id`,
    );

    // Items of expired AND explicitly closed loans (returned/revoked) are
    // released together. The controller stamps them in its own transaction;
    // this is the crash/backstop path.
    await db._pool.query(
      `UPDATE followup_loan_items li
          SET returned_at = now()
         FROM followup_loans l
        WHERE li.loan_id = l.id
          AND li.returned_at IS NULL
          AND (l.expires_at <= now() OR l.status IN ('REVOKED', 'RETURNED'))`,
    );

    await db._pool.query(
      `UPDATE followup_loans
          SET status = 'ACTIVE', updated_at = now()
        WHERE status = 'SCHEDULED'
          AND starts_at <= now()
          AND expires_at > now()`,
    );

    if ((closed || []).length > 0) {
      const ids = closed.map(r => r.id);
      await db._pool.query(
        `INSERT INTO followup_loan_events (loan_id, event_type, new_state)
         SELECT id, 'EXPIRED', jsonb_build_object('status', 'EXPIRED')
           FROM followup_loans
          WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      // Any worker could be holding a stale cache of a just-expired loan.
      invalidateLoanCache(null);
    }
    return (closed || []).length;
  } catch (e) {
    console.error('[follow-up loans] closeExpiredLoans failed:', e?.message || String(e));
    return 0;
  }
}
