import db from '../config/db.js';
import { getFroWorkersByNgo, getUserNgoIds } from './ngoAdminController.js';
import {
  getActiveGrants,
  invalidateGrantCache,
  recordAssignmentEvent,
} from '../services/temporaryAccessService.js';

// ─── Temporary Data Access — NGO Admin management ────────────────────────────
//
// Every handler is mounted behind authenticateRole('admin','super_admin') in
// ngoAdminRoutes.js (after its router.use), so admin-only is enforced by the
// router, not trusted from the client.
//
// Invariants enforced here (see plan §3/§6):
//  • Permanent ownership (fro_station_assignments.fro_worker_id) is READ but
//    never written. Granting access changes no owner, moves no donor.
//  • expires_at is mandatory — no indefinite grants.
//  • One live grant per (station, working FRO): duplicates are rejected with
//    a hint to extend the existing grant instead (partial unique index is
//    the DB backstop).
//  • Every mutation writes an append-only audit event.

const REASON_CODES = new Set(['STAFF_ABSENCE', 'WORKLOAD_SUPPORT', 'SPECIAL_ASSIGNMENT', 'OTHER']);

function badRequest(res, message, code = 'VALIDATION') {
  return res.status(400).json({ message, code });
}

// ─── FRO candidates for the grant modal ──────────────────────────────────────
//
// GET /temporary-access/fro-candidates — the picker source for "Working FRO
// (temporary)". It reuses getFroWorkersByNgo (department = FRO, same NGO
// scoping as the admin's own NGOs, test accounts excluded) and carries no
// crm_agents requirement at all — the legacy agent gate that used to live on
// /ngo-admin/fro-workers is gone with the CRM login Agents feature (migration
// 185_drop_crm_agents.sql). The modal keeps its own endpoint anyway so the
// list is fetched fresh on every open: an FRO created after the Stations page
// loaded still appears. employment_status/is_active are returned raw; the
// modal applies its own active/terminated/owner exclusions.
export async function listFroCandidates(req, res) {
  try {
    const ngoIds = await getUserNgoIds(req.user);
    const byId = new Map();
    for (const ngoId of ngoIds) {
      const rows = await getFroWorkersByNgo(ngoId);
      for (const w of rows) byId.set(w.id, w);
    }
    const list = [...byId.values()]
      .map(w => ({
        id: w.id,
        name: w.name,
        login_id: w.login_id,
        email: w.email,
        department: w.department,
        is_active: w.is_active,
        employment_status: w.employment_status || null,
      }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    return res.json(list);
  } catch (e) {
    console.error('listFroCandidates failed:', e?.message || e);
    return res.status(500).json({ message: 'Failed to load FRO candidates' });
  }
}

// Status derivation without a sweeper: live window + explicit revocation.
// Exported for unit tests.
export function deriveStatus(row, now = Date.now()) {
  if (row.status === 'REVOKED' || row.status === 'CANCELLED') return row.status;
  const starts = new Date(row.starts_at).getTime();
  const expires = new Date(row.expires_at).getTime();
  if (now < starts) return 'SCHEDULED';
  if (now >= expires) return 'EXPIRED';
  return 'ACTIVE';
}

const ASSIGN_COLS = `id, ngo_id, station, working_fro_worker_id, granted_by_admin_id,
  scope_type, starts_at, expires_at, status, reason_code, reason_note,
  created_at, updated_at, revoked_at, revoked_by_admin_id, revocation_reason`;

// The new tables carry NO FKs (mirroring work_as_sessions — admin ids span two
// id spaces, and no relationship exists for PostgREST to embed through), so
// worker names are resolved with an explicit lookup whenever needed.
async function attachWorkerNames(rows) {
  const ids = [...new Set(rows.flatMap(r => [r.working_fro_worker_id, r.granted_by_admin_id, r.revoked_by_admin_id]).filter(Boolean))];
  if (ids.length === 0) return rows;
  const { data: workers } = await db.from('workers').select('id, name, is_active').in('id', ids);
  const byId = {};
  for (const w of workers || []) byId[w.id] = w;
  for (const r of rows) {
    r.working_fro_name = byId[r.working_fro_worker_id]?.name || null;
    r.working_fro_active = byId[r.working_fro_worker_id]?.is_active ?? null;
    r.granted_by_name = byId[r.granted_by_admin_id]?.name || null;
    r.revoked_by_name = byId[r.revoked_by_admin_id]?.name || null;
  }
  return rows;
}

// ─── GET /temporary-access ───────────────────────────────────────────────────
// List with filters: ?status= (computed), ?station=, ?fro_worker_id=, ?q=
// (searches worker/station name). Always returns permanent FRO alongside so
// the admin sees "permanent vs temporary" workers separately (plan §8).
export async function listTemporaryAccess(req, res) {
  try {
    const { status, station, fro_worker_id, ngo_id, q } = req.query;

    let query = db
      .from('temporary_data_assignments')
      .select(ASSIGN_COLS)
      .order('created_at', { ascending: false })
      .limit(500);

    if (station) query = query.eq('station', station);
    if (fro_worker_id) query = query.eq('working_fro_worker_id', fro_worker_id);
    if (ngo_id) query = query.eq('ngo_id', ngo_id);

    const { data, error } = await query;
    if (error) throw error;

    // Permanent owners for the listed rows — plain query rather than a
    // PostgREST embed, so this does not depend on an (unverified) constraint
    // name. Read-only: fro_station_assignments is never written here.
    const rows0 = data || [];
    await attachWorkerNames(rows0);
    const ownerMap = {}; // "ngoId|station" -> { id, name }
    if (rows0.length > 0) {
      const ngoIds = [...new Set(rows0.map(r => r.ngo_id))];
      const stations = [...new Set(rows0.map(r => r.station))];
      const { data: ownerRows, error: oErr } = await db
        .from('fro_station_assignments')
        .select('ngo_id, station, fro_worker_id')
        .in('ngo_id', ngoIds)
        .in('station', stations);
      if (!oErr) {
        for (const o of ownerRows || []) {
          if (o.fro_worker_id) ownerMap[`${o.ngo_id}|${o.station}`] = { id: o.fro_worker_id, name: null };
        }
        const ownerIds = [...new Set(Object.values(ownerMap).map(v => v.id))];
        if (ownerIds.length > 0) {
          const { data: owners } = await db.from('workers').select('id, name').in('id', ownerIds);
          const nameById = {};
          for (const w of owners || []) nameById[w.id] = w.name;
          for (const k of Object.keys(ownerMap)) ownerMap[k].name = nameById[ownerMap[k].id] || null;
        }
      }
    }

    const now = Date.now();
    let rows = rows0.map(r => {
      const derived = deriveStatus(r, now);
      const owner = ownerMap[`${r.ngo_id}|${r.station}`] || null;
      return {
        ...r,
        computed_status: derived,
        permanent_fro_name: owner?.name || null,
        permanent_fro_worker_id: owner?.id || null,
      };
    });

    if (status) rows = rows.filter(r => r.computed_status === status);
    if (q) {
      const needle = String(q).toLowerCase();
      rows = rows.filter(r =>
        String(r.working_fro_name || '').toLowerCase().includes(needle) ||
        String(r.permanent_fro_name || '').toLowerCase().includes(needle) ||
        String(r.station || '').toLowerCase().includes(needle));
    }
    return res.json(rows);
  } catch (error) {
    console.error('listTemporaryAccess error:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// ─── GET /temporary-access/:id ───────────────────────────────────────────────
export async function getTemporaryAccess(req, res) {
  try {
    const { data, error } = await db
      .from('temporary_data_assignments')
      .select(ASSIGN_COLS)
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Assignment not found' });
    await attachWorkerNames([data]);

    const { rows: events, error: evErr } = await db._pool.query(
      `SELECT id, event_type, actor_admin_id, actor_role, previous_state, new_state, reason, created_at
         FROM temporary_data_assignment_events
        WHERE assignment_id = $1
        ORDER BY created_at DESC
        LIMIT 200`,
      [req.params.id],
    );
    if (evErr) throw new Error(evErr.message);

    return res.json({ ...data, computed_status: deriveStatus(data), events: events || [] });
  } catch (error) {
    console.error('getTemporaryAccess error:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// ─── POST /temporary-access ──────────────────────────────────────────────────
export async function createTemporaryAccess(req, res) {
  try {
    console.log('[createTemporaryAccess] checking duplicate for station=', req.body?.station, 'fro=', req.body?.working_fro_worker_id);
    const {
      ngo_id, station, working_fro_worker_id, starts_at, expires_at,
      reason_code, reason_note, scope_type = 'STATION_ALL',
    } = req.body || {};

    // ── validation ──
    if (!ngo_id || !station || !working_fro_worker_id) {
      return badRequest(res, 'ngo_id, station and working_fro_worker_id are required');
    }
    if (!reason_code || !REASON_CODES.has(reason_code)) {
      return badRequest(res, `reason_code must be one of: ${[...REASON_CODES].join(', ')}`);
    }
    if (reason_code === 'OTHER' && !String(reason_note || '').trim()) {
      return badRequest(res, 'reason_note is required when reason_code is OTHER');
    }
    const VALID_SCOPES = new Set(['STATION_ALL', 'STATION_HIGH_TIER', 'STATION_NORMAL', 'SELECTED_DONORS']);
    if (!VALID_SCOPES.has(scope_type)) {
      return badRequest(res, `scope_type must be one of: ${[...VALID_SCOPES].join(', ')}`, 'BAD_SCOPE');
    }
    if (scope_type === 'SELECTED_DONORS') {
      return badRequest(res, 'scope_type SELECTED_DONORS is not yet supported; use STATION_ALL, STATION_HIGH_TIER, or STATION_NORMAL', 'SCOPE_UNSUPPORTED');
    }
    const start = new Date(starts_at);
    const expiry = new Date(expires_at);
    if (isNaN(start.getTime()) || isNaN(expiry.getTime())) {
      return badRequest(res, 'starts_at and expires_at must be valid dates');
    }
    if (expiry <= start) return badRequest(res, 'expires_at must be after starts_at');
    if (expiry.getTime() <= Date.now()) {
      return badRequest(res, 'expires_at must be in the future');
    }

    // NGO ↔ station relationship must exist (same table the permanent
    // dropdown writes, read-only here).
    const { data: stationRow, error: stErr } = await db
      .from('fro_station_assignments')
      .select('id, ngo_id, station, fro_worker_id')
      .eq('ngo_id', ngo_id)
      .eq('station', station)
      .maybeSingle();
    if (stErr) throw stErr;
    if (!stationRow) return badRequest(res, 'Station does not belong to this NGO', 'STATION_NOT_FOUND');

    // Working FRO eligibility: must exist, be an FRO, and be active.
    const { data: froRow, error: froErr } = await db
      .from('workers')
      .select('id, name, department, is_active, employment_status, is_test')
      .eq('id', working_fro_worker_id)
      .maybeSingle();
    if (froErr) throw froErr;
    if (!froRow) return badRequest(res, 'Working FRO not found', 'FRO_NOT_FOUND');
    const dept = String(froRow.department || '').toLowerCase().trim();
    if (dept !== 'fro' && dept !== 'telecaller') {
      return badRequest(res, 'Selected worker is not an FRO', 'FRO_INELIGIBLE');
    }
    if (froRow.is_active === false || froRow.employment_status === 'terminated') {
      return badRequest(res, 'Selected FRO is not eligible (inactive or terminated)', 'FRO_INELIGIBLE');
    }

    // Expire stale grants first so the partial unique index
    // (tda_active_station_fro_uniq, WHERE status IN SCHEDULED/ACTIVE) does not
    // block re-granting after expiry. Status is derived at read time, but the
    // index needs the DB column to reflect expiry.
    try {
      const upd = await db._pool.query(
        `UPDATE temporary_data_assignments
            SET status = 'EXPIRED', updated_at = now()
          WHERE station = $1
            AND working_fro_worker_id = $2
            AND status IN ('SCHEDULED', 'ACTIVE')
            AND expires_at <= now()
          RETURNING id`,
        [station, working_fro_worker_id],
      );
      console.log('[createTemporaryAccess] expired stale grants:', upd.rows?.length);
    } catch (updErr) {
      console.error('[createTemporaryAccess] stale-grant expiry update failed:', updErr?.message);
    }

    // Duplicate live grant → hint to extend instead of stacking rows.
    const { data: dup, error: dupErr } = await db
      .from('temporary_data_assignments')
      .select('id, expires_at, status')
      .eq('station', station)
      .eq('working_fro_worker_id', working_fro_worker_id)
      .in('status', ['SCHEDULED', 'ACTIVE'])
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    console.log('[createTemporaryAccess] dup check: dup=', dup, 'err=', dupErr?.message, 'now=', new Date().toISOString());
    if (dup) {
      return res.status(409).json({
        message: 'An active temporary grant already exists for this FRO and station — extend it instead',
        code: 'DUPLICATE_GRANT',
        existing_id: dup.id,
        existing_expires_at: dup.expires_at,
      });
    }

    // ── "Full vs separated" rule ──
    // A station can have at most 2 grants if separated (high + normal),
    // or 1 if full access. Can't mix full with separated.
    const { data: existingStationGrants } = await db
      .from('temporary_data_assignments')
      .select('id, scope_type, working_fro_worker_id')
      .eq('station', station)
      .in('status', ['SCHEDULED', 'ACTIVE'])
      .gt('expires_at', new Date().toISOString());
    const activeScopes = new Set((existingStationGrants || []).map(g => g.scope_type));
    if (scope_type === 'STATION_ALL') {
      if (activeScopes.size > 0) {
        return badRequest(res, 'Cannot grant full access: station already has a separated (high/normal) grant. Revoke existing grants first.', 'SCOPE_CONFLICT');
      }
    } else {
      // STATION_HIGH_TIER or STATION_NORMAL
      if (activeScopes.has('STATION_ALL')) {
        return badRequest(res, 'Cannot grant tiered access: station already has a full-access grant. Revoke it first.', 'SCOPE_CONFLICT');
      }
      if (activeScopes.has(scope_type)) {
        return badRequest(res, `A ${scope_type} grant already exists for this station. Revoke it first.`, 'SCOPE_CONFLICT');
      }
    }

    // Overlap advisory: another FRO already works this station temporarily.
    const { data: overlaps } = await db
      .from('temporary_data_assignments')
      .select('id, working_fro_worker_id, expires_at')
      .eq('station', station)
      .neq('working_fro_worker_id', working_fro_worker_id)
      .in('status', ['SCHEDULED', 'ACTIVE'])
      .gt('expires_at', new Date().toISOString());
    const conflicts = (overlaps || []).map(o => ({
      assignment_id: o.id,
      working_fro_worker_id: o.working_fro_worker_id,
      expires_at: o.expires_at,
    }));

    // ── insert + audit in one transaction ──
    const adminId = req.user?.id || null;
    const adminRole = req.user?.role || null;
    const result = await db.transaction(async () => {
      const { rows, error } = await db._pool.query(
        `INSERT INTO temporary_data_assignments
           (ngo_id, station, working_fro_worker_id, granted_by_admin_id,
            scope_type, starts_at, expires_at, status, reason_code, reason_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING ${ASSIGN_COLS.split(',').map(c => c.trim()).join(', ')}`,
        [
          ngo_id, station, working_fro_worker_id, adminId,
          scope_type, start.toISOString(), expiry.toISOString(),
          start.getTime() > Date.now() ? 'SCHEDULED' : 'ACTIVE',
          reason_code, String(reason_note || '').trim() || null,
        ],
      );
      if (error) throw error;
      const row = rows[0];
      await recordAssignmentEvent({
        assignmentId: row.id,
        eventType: 'GRANTED',
        actorAdminId: adminId,
        actorRole: adminRole,
        newState: {
          station: row.station, ngo_id: row.ngo_id,
          working_fro_worker_id: row.working_fro_worker_id,
          scope_type: row.scope_type, starts_at: row.starts_at, expires_at: row.expires_at,
        },
        reason: reason_code,
      });
      return row;
    });

    // The working FRO's donor list/station caches may now include the new
    // scope — drop them so the very next request reflects the grant (the
    // grant cache itself is keyed per worker and is cold for a new grantee,
    // but invalidate anyway for the extend/duplicate paths that share this).
    invalidateGrantCache(working_fro_worker_id);

    return res.status(201).json({
      assignment: { ...result, computed_status: deriveStatus(result) },
      conflicts,
      permanent_owner_unchanged: true,
    });
  } catch (error) {
    // Partial unique index race (two admins created the same pair at once)
    // surfaces here as a 23505 — answer with the same "extend instead" hint.
    if (error?.code === '23505' || String(error?.message || '').includes('tda_active_station_fro_uniq')) {
      console.log('[createTemporaryAccess] 23505 caught, checking if existing grant is expired...');
      // The existing grant might be expired but still have status ACTIVE.
      // Update it and retry.
      await db._pool.query(
        `UPDATE temporary_data_assignments
            SET status = 'EXPIRED', updated_at = now()
          WHERE station = $1
            AND working_fro_worker_id = $2
            AND status IN ('SCHEDULED', 'ACTIVE')
            AND expires_at <= now()`,
        [station, working_fro_worker_id],
      );
      // Retry the insert
      const retryResult = await db.transaction(async () => {
        const { rows, error: retryErr } = await db._pool.query(
          `INSERT INTO temporary_data_assignments
             (ngo_id, station, working_fro_worker_id, granted_by_admin_id,
              scope_type, starts_at, expires_at, status, reason_code, reason_note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING ${ASSIGN_COLS.split(',').map(c => c.trim()).join(', ')}`,
          [
            ngo_id, station, working_fro_worker_id, adminId,
            scope_type, start.toISOString(), expiry.toISOString(),
            start.getTime() > Date.now() ? 'SCHEDULED' : 'ACTIVE',
            reason_code, String(reason_note || '').trim() || null,
          ],
        );
        if (retryErr) throw retryErr;
        const row = rows[0];
        await recordAssignmentEvent({
          assignmentId: row.id,
          eventType: 'GRANTED',
          actorAdminId: adminId,
          actorRole: adminRole,
          newState: {
            station: row.station, ngo_id: row.ngo_id,
            working_fro_worker_id: row.working_fro_worker_id,
            scope_type: row.scope_type, starts_at: row.starts_at, expires_at: row.expires_at,
          },
          reason: reason_code,
        });
        return row;
      });
      invalidateGrantCache(working_fro_worker_id);
      return res.status(201).json({
        assignment: { ...retryResult, computed_status: deriveStatus(retryResult) },
        conflicts,
        permanent_owner_unchanged: true,
      });
    }
    console.error('createTemporaryAccess error:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// ─── POST /temporary-access/:id/extend ───────────────────────────────────────
// Only expires_at may be pushed. Start time and scope are immutable here:
// changing them retroactively would rewrite what was authorized in the past.
export async function extendTemporaryAccess(req, res) {
  try {
    const { expires_at, reason } = req.body || {};
    const expiry = new Date(expires_at);
    if (isNaN(expiry.getTime())) return badRequest(res, 'expires_at must be a valid date');

    const { data: before, error: bErr } = await db
      .from('temporary_data_assignments')
      .select(ASSIGN_COLS)
      .eq('id', req.params.id)
      .maybeSingle();
    if (bErr) throw bErr;
    if (!before) return res.status(404).json({ message: 'Assignment not found' });
    if (before.status === 'REVOKED' || before.status === 'CANCELLED') {
      return badRequest(res, `Cannot extend a ${before.status.toLowerCase()} grant`, 'BAD_STATUS');
    }
    if (expiry.getTime() <= new Date(before.starts_at).getTime()) {
      return badRequest(res, 'expires_at must be after starts_at');
    }

    const adminId = req.user?.id || null;
    const adminRole = req.user?.role || null;
    const updated = await db.transaction(async () => {
      const { rows, error } = await db._pool.query(
        `UPDATE temporary_data_assignments
            SET expires_at = $2,
                status = CASE
                  WHEN status = 'EXPIRED' THEN 'ACTIVE'
                  WHEN status IN ('SCHEDULED','ACTIVE') AND starts_at > now() THEN 'SCHEDULED'
                  ELSE status END,
                updated_at = now()
          WHERE id = $1
          RETURNING ${ASSIGN_COLS.split(',').map(c => c.trim()).join(', ')}`,
        [req.params.id, expiry.toISOString()],
      );
      if (error) throw error;
      if (!rows[0]) return null;
      await recordAssignmentEvent({
        assignmentId: req.params.id,
        eventType: 'EXTENDED',
        actorAdminId: adminId,
        actorRole: adminRole,
        previousState: { expires_at: before.expires_at, status: before.status },
        newState: { expires_at: rows[0].expires_at, status: rows[0].status },
        reason: typeof reason === 'string' ? reason.slice(0, 500) : null,
      });
      return rows[0];
    });
    if (!updated) return res.status(404).json({ message: 'Assignment not found' });

    invalidateGrantCache(updated.working_fro_worker_id);
    return res.json({ assignment: { ...updated, computed_status: deriveStatus(updated) } });
  } catch (error) {
    console.error('extendTemporaryAccess error:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// ─── POST /temporary-access/:id/revoke ───────────────────────────────────────
// Immediate effect: status → REVOKED (denies on the next request), grant
// cache invalidated (so the FRO's own cached scope is dropped), FRO donor
// caches dropped via invalidateFroCaches-equivalent prefix clear. Completed
// work — logs, receipts, ownership — is never touched.
export async function revokeTemporaryAccess(req, res) {
  try {
    const { reason } = req.body || {};

    const { data: before, error: bErr } = await db
      .from('temporary_data_assignments')
      .select(ASSIGN_COLS)
      .eq('id', req.params.id)
      .maybeSingle();
    if (bErr) throw bErr;
    if (!before) return res.status(404).json({ message: 'Assignment not found' });
    if (before.status === 'REVOKED') {
      return res.json({ assignment: { ...before, computed_status: 'REVOKED' }, already_revoked: true });
    }

    const adminId = req.user?.id || null;
    const adminRole = req.user?.role || null;
    const updated = await db.transaction(async () => {
      const { rows, error } = await db._pool.query(
        `UPDATE temporary_data_assignments
            SET status = 'REVOKED',
                revoked_at = now(),
                revoked_by_admin_id = $2,
                revocation_reason = $3,
                updated_at = now()
          WHERE id = $1 AND status <> 'REVOKED'
          RETURNING ${ASSIGN_COLS.split(',').map(c => c.trim()).join(', ')}`,
        [req.params.id, adminId, typeof reason === 'string' ? reason.slice(0, 500) : null],
      );
      if (error) throw error;
      if (!rows[0]) return null;
      await recordAssignmentEvent({
        assignmentId: req.params.id,
        eventType: 'REVOKED',
        actorAdminId: adminId,
        actorRole: adminRole,
        previousState: { status: before.status, expires_at: before.expires_at },
        newState: { status: 'REVOKED', revoked_at: rows[0].revoked_at },
        reason: typeof reason === 'string' ? reason.slice(0, 500) : null,
      });
      return rows[0];
    });
    if (!updated) return res.status(404).json({ message: 'Assignment not found' });

    // Drop BOTH cache layers the FRO may be holding: the grant lookup (this
    // service) and her donor/station read payloads (fro:* prefixes), so an
    // open My Leads tab refetches a scope without this station immediately.
    invalidateGrantCache(updated.working_fro_worker_id);
    try {
      const { invalidateFroCaches } = await import('../controllers/froController.js');
      invalidateFroCaches(updated.working_fro_worker_id);
    } catch (e) {
      console.warn('[temp access] fro cache invalidation skipped:', e?.message || String(e));
    }

    return res.json({ assignment: { ...updated, computed_status: 'REVOKED' } });
  } catch (error) {
    console.error('revokeTemporaryAccess error:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// ─── GET /temporary-access/validate ──────────────────────────────────────────
// Pre-flight for the grant modal: returns duplicate/conflict warnings before
// the admin confirms (the same checks create runs, minus the insert).
export async function validateTemporaryAccess(req, res) {
  try {
    const { station, working_fro_worker_id } = req.query;
    if (!station || !working_fro_worker_id) {
      return badRequest(res, 'station and working_fro_worker_id are required');
    }
    const { data: dup, error: dupErr } = await db
      .from('temporary_data_assignments')
      .select('id, expires_at, status, scope_type')
      .eq('station', station)
      .eq('working_fro_worker_id', working_fro_worker_id)
      .in('status', ['SCHEDULED', 'ACTIVE'])
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    console.log('[validateTemporaryAccess] dup check: dup=', dup, 'err=', dupErr?.message);
    const { data: overlaps } = await db
      .from('temporary_data_assignments')
      .select('id, working_fro_worker_id, expires_at, scope_type')
      .eq('station', station)
      .neq('working_fro_worker_id', working_fro_worker_id)
      .in('status', ['SCHEDULED', 'ACTIVE'])
      .gt('expires_at', new Date().toISOString());

    // Check if station has high-tier data.
    let hasHighTier = false;
    try {
      console.log('[validateTemporaryAccess] checking high-tier for station=', JSON.stringify(station));
      const { data: htRows, error: htErr } = await db
        .from('fro_assignments')
        .select('id, batch_type, station')
        .eq('station', station)
        .limit(5);
      console.log('[validateTemporaryAccess] sample rows for station:', JSON.stringify(htRows), 'err=', htErr?.message);
      const { data: htRows2 } = await db
        .from('fro_assignments')
        .select('id')
        .eq('station', station)
        .eq('batch_type', 'high_tier')
        .limit(1);
      hasHighTier = (htRows2 || []).length > 0;
      console.log('[validateTemporaryAccess] hasHighTier=', hasHighTier, 'htRows2=', JSON.stringify(htRows2));
    } catch (e) { console.error('[validateTemporaryAccess] high-tier check failed:', e?.message); }

    return res.json({
      duplicate: dup ? { id: dup.id, expires_at: dup.expires_at, scope_type: dup.scope_type } : null,
      conflicts: (overlaps || []),
      has_high_tier: hasHighTier,
    });
  } catch (error) {
    console.error('validateTemporaryAccess error:', error.message);
    return res.status(500).json({ message: error.message });
  }
}
