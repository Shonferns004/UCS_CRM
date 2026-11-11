import db from '../config/db.js';
import { invalidateGrantCache, invalidateSliceCache } from '../services/temporaryAccessService.js';
import { isStacksEnabledForStation, setStacksEnabledForStation, listStackSettings } from '../services/stackSettings.js';

// Resolve acting admin to a valid users.id (super_admin id=0 is not a users row).
async function resolveAdminId(user) {
  if (user && user.id && user.id !== 0 && user.id !== -1 && user.email) {
    try {
      const { data } = await db.from('users').select('id').eq('id', user.id).maybeSingle();
      if (data?.id) return data.id;
    } catch { /* fall through */ }
  }
  // Fallback: first admin/super_admin user row.
  try {
    const { data } = await db.from('users').select('id').in('role', ['admin', 'super_admin']).limit(1).maybeSingle();
    if (data?.id) return data.id;
  } catch { /* fall through */ }
  return null;
}

// ─── Stack settings (global on/off switch) ──────────────────────────────────

export const getStackSettings = async (req, res) => {
  try {
    const { ngo_id, station } = req.query;
    // One station (the settings dialog) or the full map (row ⋮ menus).
    if (station) {
      return res.json({ enabled: await isStacksEnabledForStation(ngo_id, station) });
    }
    return res.json({ stations: await listStackSettings() });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

export const updateStackSettings = async (req, res) => {
  try {
    const body = req.body || {};
    const ngoId = body.ngo_id ?? body.ngoId;
    const station = String(body.station || '').trim();
    if (!station) return res.status(400).json({ message: 'station is required' });
    const raw = body.enabled ?? body.value ?? body.stacks_enabled;
    const enabled = raw === true || raw === 'true' || raw === 1 || raw === '1';
    await setStacksEnabledForStation(ngoId, station, enabled);
    return res.json({
      enabled,
      message: enabled
        ? `Stack assignments are ON for ${station} only.`
        : `Stack assignments are OFF for ${station} — donors stay with the FRO they are assigned to.`,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

// ─── Stack CRUD + members + FRO assignment ────────────────────────────────────

export const listStacks = async (req, res) => {
  try {
    const { station, ngo_id } = req.query;
    if (!ngo_id) return res.status(400).json({ message: 'ngo_id required' });
    const params = [ngo_id];
    let where = 'WHERE s.ngo_id = $1';
    if (station) { where += ' AND s.station = $2'; params.push(station); }
    const { rows } = await db._pool.query(
      `SELECT s.id, s.ngo_id, s.station, s.name, s.stack_type, s.fro_worker_id,
              w.name AS fro_name, s.created_at, s.updated_at,
              (SELECT count(*)::int FROM donor_stack_members m WHERE m.stack_id = s.id) AS member_count,
              (SELECT count(*)::int FROM donor_stack_members m JOIN fro_assignments fa ON fa.id = m.assignment_id WHERE m.stack_id = s.id AND fa.status = 'pending') AS pending_count
         FROM donor_stacks s
         LEFT JOIN workers w ON w.id = s.fro_worker_id
        ${where}
        ORDER BY s.station ASC,
                 COALESCE(substring(s.name from '([0-9]+)\\s*$')::int, 2147483647) ASC,
                 s.name ASC,
                 s.created_at ASC,
                 s.id ASC`,
      params,
    );
    return res.json({ stacks: rows || [] });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

export const createStack = async (req, res) => {
  try {
    const { ngo_id, station, name, stack_type = 'normal', donor_ids = [], created_by } = req.body || {};
    if (!ngo_id || !station || !name) return res.status(400).json({ message: 'ngo_id, station, name required' });
    if (!(await isStacksEnabledForStation(ngo_id, station))) {
      return res.status(409).json({ message: `Stack assignments are OFF for ${station}. Enable them in Settings first.` });
    }
    const client = await db._pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO donor_stacks (ngo_id, station, name, stack_type, created_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [ngo_id, station, name, stack_type, created_by || null],
      );
      const stackId = rows[0].id;
      if (Array.isArray(donor_ids) && donor_ids.length > 0) {
        await client.query(
          `INSERT INTO donor_stack_members (stack_id, donor_id, assignment_id)
           SELECT $1, donor_id, id FROM fro_assignments
            WHERE station = $2 AND ngo_id = $3 AND donor_id = ANY($4::int[])
              AND (status IS NULL OR status <> 'reassigned')
           ON CONFLICT (stack_id, donor_id) DO NOTHING`,
          [stackId, station, ngo_id, donor_ids],
        );
      }
      await client.query('COMMIT');
      const { rows: mc } = await db._pool.query('SELECT count(*)::int c FROM donor_stack_members WHERE stack_id = $1', [stackId]);
      return res.status(201).json({ stack: { id: stackId, ngo_id, station, name, stack_type, member_count: mc[0]?.c || 0 } });
    } catch (e) {
      await client.query('ROLLBACK');
      if (e?.code === '23505') {
        return res.status(409).json({ message: 'One or more donors are already in another stack on this station. Remove them first.' });
      }
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    if (e?.code === '23505') {
      return res.status(409).json({ message: 'One or more donors are already in another stack on this station. Remove them first.' });
    }
    return res.status(500).json({ message: e.message });
  }
};

export const updateStack = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, fro_worker_id } = req.body || {};
    const sets = [];
    const params = [];
    let i = 1;
    if (name !== undefined) { sets.push(`name = $${i++}`); params.push(name); }
    if (fro_worker_id !== undefined) { sets.push(`fro_worker_id = $${i++}`); params.push(fro_worker_id || null); }
    if (sets.length === 0) return res.status(400).json({ message: 'nothing to update' });
    sets.push(`updated_at = now()`);
    params.push(id);
    const { rowCount } = await db._pool.query(
      `UPDATE donor_stacks SET ${sets.join(', ')} WHERE id = $${i}`,
      params,
    );
    if (rowCount === 0) return res.status(404).json({ message: 'stack not found' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

export const deleteStack = async (req, res) => {
  try {
    const { id } = req.params;
    // Revoke any temp grant for this stack's FRO on this station before delete.
    const { rows: st } = await db._pool.query('SELECT station, fro_worker_id FROM donor_stacks WHERE id = $1', [id]);
    if (st.length && st[0].fro_worker_id) {
      await db._pool.query(
        `UPDATE temporary_data_assignments SET status='REVOKED', revoked_at=now(), updated_at=now()
          WHERE station = $1 AND working_fro_worker_id = $2 AND status IN ('SCHEDULED','ACTIVE')`,
        [st[0].station, st[0].fro_worker_id],
      );
      invalidateGrantCache(st[0].fro_worker_id);
      invalidateSliceCache(null);
    }
    const { rowCount } = await db._pool.query('DELETE FROM donor_stacks WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ message: 'stack not found' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

export const addMembers = async (req, res) => {
  try {
    const { id } = req.params;
    const { donor_ids = [] } = req.body || {};
    if (!Array.isArray(donor_ids) || donor_ids.length === 0) return res.status(400).json({ message: 'donor_ids required' });
    const { rows: st } = await db._pool.query('SELECT station, ngo_id FROM donor_stacks WHERE id = $1', [id]);
    if (!st.length) return res.status(404).json({ message: 'stack not found' });
    const { station, ngo_id } = st[0];
    await db._pool.query(
      `INSERT INTO donor_stack_members (stack_id, donor_id, assignment_id)
       SELECT $1, donor_id, id FROM fro_assignments
        WHERE station = $2 AND ngo_id = $3 AND donor_id = ANY($4::int[])
          AND (status IS NULL OR status <> 'reassigned')
       ON CONFLICT (stack_id, donor_id) DO NOTHING`,
      [id, station, ngo_id, donor_ids],
    );
    // Re-sync temp grant if stack has an assigned FRO.
    await syncStackGrant(id);
    return res.json({ ok: true });
  } catch (e) {
    if (e?.code === '23505') {
      return res.status(409).json({ message: 'One or more donors are already in another stack on this station. Remove them first.' });
    }
    return res.status(500).json({ message: e.message });
  }
};

export const removeMembers = async (req, res) => {
  try {
    const { id } = req.params;
    // Accept donor_ids from body OR query (DELETE with body is unreliable in some clients).
    let donor_ids = req.body?.donor_ids;
    if (!donor_ids && req.query?.donor_ids) {
      donor_ids = Array.isArray(req.query.donor_ids) ? req.query.donor_ids : [req.query.donor_ids];
    }
    if (!Array.isArray(donor_ids) || donor_ids.length === 0) return res.status(400).json({ message: 'donor_ids required' });
    await db._pool.query(
      'DELETE FROM donor_stack_members WHERE stack_id = $1 AND donor_id = ANY($2::int[])',
      [id, donor_ids],
    );
    // Re-sync temp grant if stack has an assigned FRO.
    await syncStackGrant(id);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

export const assignFroToStack = async (req, res) => {
  try {
    const { id } = req.params;
    const { fro_worker_id } = req.body || {};
    const { rows: st } = await db._pool.query('SELECT * FROM donor_stacks WHERE id = $1', [id]);
    if (!st.length) return res.status(404).json({ message: 'stack not found' });
    const stack = st[0];
    if (!(await isStacksEnabledForStation(stack.ngo_id, stack.station))) {
      return res.status(409).json({ message: `Stack assignments are OFF for ${stack.station}. Enable them in Settings first.` });
    }

    const oldFro = stack.fro_worker_id;
    const nextFro = fro_worker_id || null;
    const adminId = await resolveAdminId(req.user);
    // Revoke existing grant for old FRO on this station.
    if (oldFro) {
      await db._pool.query(
        `UPDATE temporary_data_assignments SET status='REVOKED', revoked_at=now(), updated_at=now()
          WHERE station = $1 AND working_fro_worker_id = $2 AND status IN ('SCHEDULED','ACTIVE')`,
        [stack.station, oldFro],
      );
      invalidateGrantCache(oldFro);
    }

    await db._pool.query('UPDATE donor_stacks SET fro_worker_id = $1, updated_at = now() WHERE id = $2', [nextFro, id]);
    // Keep a durable audit trail of who held this stack before.
    await recordFroHistory({ stack, nextFro, adminId });

    // Invalidate new FRO's grant cache so they see the grant immediately.
    if (fro_worker_id) invalidateGrantCache(fro_worker_id);
    invalidateSliceCache(null);

    if (fro_worker_id) {
      // get member assignment ids
      const { rows: mc } = await db._pool.query(
        'SELECT assignment_id FROM donor_stack_members WHERE stack_id = $1 AND assignment_id IS NOT NULL',
        [id],
      );
      const ids = (mc || []).map(r => r.assignment_id).filter(Boolean);
      const count = ids.length;
      // FRO permanent station for target_station
      const { rows: fs } = await db._pool.query('SELECT station FROM fro_station_assignments WHERE fro_worker_id = $1 ORDER BY station ASC LIMIT 1', [fro_worker_id]);
      const targetStation = fs[0]?.station || null;
      if (targetStation && count > 0) {
        await db._pool.query(
          `UPDATE fro_assignments SET target_station = $1, updated_at = now()
            WHERE id = ANY($2::int[])`,
          [targetStation, ids],
        );
      }
      // Create temp grant with explicit allowed_assignment_ids.
      const start = new Date();
      const expiry = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
      // One FRO can only have ONE active grant per station (unique constraint).
      // If a grant already exists for this FRO on this station, MERGE the new
      // slice ids into it instead of inserting a duplicate.
      const { rows: existing } = await db._pool.query(
        `SELECT id, allowed_assignment_ids FROM temporary_data_assignments
          WHERE station = $1 AND working_fro_worker_id = $2 AND status IN ('SCHEDULED','ACTIVE')
          ORDER BY created_at DESC LIMIT 1`,
        [stack.station, fro_worker_id],
      );
      if (existing.length > 0) {
        const grant = existing[0];
        const oldIds = grant.allowed_assignment_ids || [];
        const merged = [...new Set([...oldIds, ...ids])];
        await db._pool.query(
          `UPDATE temporary_data_assignments
              SET allowed_assignment_ids = $1,
                  allowed_count = $2,
                  expires_at = $3,
                  updated_at = now()
            WHERE id = $4`,
          [merged, merged.length, expiry.toISOString(), grant.id],
        );
      } else {
        await db._pool.query(
          `INSERT INTO temporary_data_assignments
             (ngo_id, station, working_fro_worker_id, granted_by_admin_id, scope_type,
              starts_at, expires_at, status, reason_code, reason_note,
              allowed_count, allowed_offset, allowed_assignment_ids)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            stack.ngo_id, stack.station, fro_worker_id, adminId,
            stack.stack_type === 'high_tier' ? 'STATION_HIGH_TIER' : 'STATION_ALL',
            start.toISOString(), expiry.toISOString(), 'ACTIVE', 'WORKLOAD_SUPPORT', `Stack: ${stack.name}`,
            count, 0, ids,
          ],
        );
      }
      return res.json({ ok: true, fro_worker_id, member_count: count, target_station: targetStation });
    }
    return res.json({ ok: true, fro_worker_id: null });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

export const getStackMembers = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db._pool.query(
      `SELECT m.donor_id, m.added_at, d.name AS donor_name, d.mobile_number, d.city,
              fa.status AS donor_status
         FROM donor_stack_members m
         LEFT JOIN donor_profiles d ON d.id = m.donor_id
         LEFT JOIN fro_assignments fa ON fa.id = m.assignment_id
        WHERE m.stack_id = $1
        ORDER BY m.added_at ASC`,
      [id],
    );
    return res.json({ members: rows || [] });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

export const getStackFroHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db._pool.query(
      `SELECT h.id, h.stack_id, h.fro_worker_id, h.fro_name,
              h.assigned_by_admin_id, h.assigned_at, h.unassigned_at,
              h.unassigned_reason
         FROM donor_stack_fro_history h
        WHERE h.stack_id = $1
        ORDER BY h.assigned_at DESC, h.id DESC`,
      [id],
    );
    return res.json({ history: rows || [] });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

export const getMyStacks = async (req, res) => {
  try {
    const workerId = req.user.id;
    const { station } = req.query;
    let sql = `SELECT s.id, s.ngo_id, s.station, s.name, s.stack_type, s.fro_worker_id, s.created_at,
                      (SELECT count(*)::int FROM donor_stack_members m WHERE m.stack_id = s.id) AS member_count
                 FROM donor_stacks s
                WHERE s.fro_worker_id = $1`;
    const params = [workerId];
    if (station) { sql += ' AND s.station = $2'; params.push(station); }
    sql += ` ORDER BY COALESCE(substring(s.name from '([0-9]+)\\s*$')::int, 2147483647) ASC,
                      s.name ASC, s.created_at ASC, s.id ASC`;
    const { rows } = await db._pool.query(sql, params);
    // Stacks are enabled per station. An FRO can hold stacks on several
    // stations, so filter only the ones whose switch is ON — the rest keep
    // working through their normal assigned donor list.
    const switchCache = new Map();
    const visible = [];
    for (const row of rows || []) {
      const key = `${row.ngo_id}|${row.station}`;
      if (!switchCache.has(key)) {
        switchCache.set(key, await isStacksEnabledForStation(row.ngo_id, row.station));
      }
      if (switchCache.get(key)) visible.push(row);
    }
    return res.json({ stacks: visible });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

// Helper: append an FRO assignment window to donor_stack_fro_history. Closes
// the previously open row (if any) and opens a new one for the incoming FRO.
// Audit-only: failures are logged and never block the assignment itself.
async function recordFroHistory({ stack, nextFro, adminId }) {
  try {
    const stackId = stack.id;
    const prevFro = stack.fro_worker_id || null;
    if (String(prevFro || '') === String(nextFro || '')) return;

    const { rows: openRows } = await db._pool.query(
      `SELECT id, fro_worker_id FROM donor_stack_fro_history
        WHERE stack_id = $1 AND unassigned_at IS NULL
        ORDER BY assigned_at DESC LIMIT 1`,
      [stackId],
    );

    if (openRows.length > 0) {
      await db._pool.query(
        `UPDATE donor_stack_fro_history
            SET unassigned_at = now(), unassigned_reason = $2
          WHERE id = $1`,
        [openRows[0].id, nextFro ? 'reassigned' : 'unassigned'],
      );
    } else if (prevFro) {
      // The stack already had an FRO before this feature existed — backfill
      // the previous holder so the change is visible. updated_at is the best
      // available estimate for when that assignment started.
      const { rows: prevWorker } = await db._pool.query('SELECT name FROM workers WHERE id = $1', [prevFro]);
      await db._pool.query(
        `INSERT INTO donor_stack_fro_history
           (stack_id, fro_worker_id, fro_name, assigned_by_admin_id,
            assigned_at, unassigned_at, unassigned_reason)
         VALUES ($1,$2,$3,$4, COALESCE($5, now()), now(), $6)`,
        [stackId, prevFro, prevWorker[0]?.name || null, adminId, stack.updated_at || null, nextFro ? 'reassigned' : 'unassigned'],
      );
    }

    if (nextFro) {
      const { rows: worker } = await db._pool.query('SELECT name FROM workers WHERE id = $1', [nextFro]);
      await db._pool.query(
        `INSERT INTO donor_stack_fro_history
           (stack_id, fro_worker_id, fro_name, assigned_by_admin_id)
         VALUES ($1,$2,$3,$4)`,
        [stackId, nextFro, worker[0]?.name || null, adminId],
      );
    }
  } catch (e) {
    console.warn('[stack] fro history record failed:', e?.message || String(e));
  }
}

// Helper: re-sync temp grant allowed_assignment_ids when stack members change.
async function syncStackGrant(stackId) {
  try {
    const { rows: st } = await db._pool.query('SELECT station, fro_worker_id FROM donor_stacks WHERE id = $1', [stackId]);
    if (!st.length || !st[0].fro_worker_id) return;
    const station = st[0].station;
    const fro = st[0].fro_worker_id;
    const { rows: mc } = await db._pool.query('SELECT array_agg(assignment_id) AS ids FROM donor_stack_members WHERE stack_id = $1 AND assignment_id IS NOT NULL', [stackId]);
    const ids = (mc[0]?.ids || []).filter(Boolean);
    await db._pool.query(
      `UPDATE temporary_data_assignments
          SET allowed_assignment_ids = $1, allowed_count = $2, updated_at = now()
        WHERE station = $3 AND working_fro_worker_id = $4 AND status IN ('SCHEDULED','ACTIVE')`,
      [ids, ids.length, station, fro],
    );
    invalidateGrantCache(fro);
    // Invalidate slice cache for all grants on this station.
    invalidateSliceCache(null);
  } catch (e) {
    console.warn('[stack] grant sync failed:', e?.message || String(e));
  }
}
