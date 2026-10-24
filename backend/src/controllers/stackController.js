import db from '../config/db.js';

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
        ORDER BY s.station ASC, s.created_at ASC`,
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
    const { donor_ids = [] } = req.body || {};
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

    // Revoke existing grant for old FRO on this station.
    if (stack.fro_worker_id) {
      await db._pool.query(
        `UPDATE temporary_data_assignments SET status='REVOKED', revoked_at=now(), updated_at=now()
          WHERE station = $1 AND working_fro_worker_id = $2 AND status IN ('SCHEDULED','ACTIVE')`,
        [stack.station, stack.fro_worker_id],
      );
    }

    await db._pool.query('UPDATE donor_stacks SET fro_worker_id = $1, updated_at = now() WHERE id = $2', [fro_worker_id || null, id]);

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
      await db._pool.query(
        `INSERT INTO temporary_data_assignments
           (ngo_id, station, working_fro_worker_id, granted_by_admin_id, scope_type,
            starts_at, expires_at, status, reason_code, reason_note,
            allowed_count, allowed_offset, allowed_assignment_ids)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          stack.ngo_id, stack.station, fro_worker_id, null,
          stack.stack_type === 'high_tier' ? 'STATION_HIGH_TIER' : 'STATION_ALL',
          start.toISOString(), expiry.toISOString(), 'ACTIVE', 'WORKLOAD_SUPPORT', `Stack: ${stack.name}`,
          count, 0, ids,
        ],
      );
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
    sql += ' ORDER BY s.created_at ASC';
    const { rows } = await db._pool.query(sql, params);
    return res.json({ stacks: rows || [] });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

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
  } catch (e) {
    console.warn('[stack] grant sync failed:', e?.message || String(e));
  }
}
