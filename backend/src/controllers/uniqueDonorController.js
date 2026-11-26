import crypto from 'crypto';
import db from '../config/db.js';
import { getUserNgoIds, bustStationCache } from './ngoAdminController.js';
import { invalidateFroCaches } from './froController.js';

const FILTERS = new Set(['all', 'premium', 'high', 'medium', 'low', 'below']);

const resolveUserUuid = async (user) => {
  if (!user?.id) return null;
  const { rows } = await db._pool.query(`select id from users where id = $1`, [user.id]);
  return rows[0]?.id || null;
};

const loadNgo = async (ngoId, allowed) => {
  if (!ngoId || !allowed.includes(ngoId)) return null;
  const { rows } = await db._pool.query(`select id, code from ngos where id=$1`, [ngoId]);
  return rows[0] || null;
};

const sourcePrefix = (code) => {
  const c = String(code || '').toUpperCase();
  if (c === 'AFLF') return 'AOD';
  if (c === 'MANN') return 'MOD';
  return null;
};

const UNIQUE_SQL = `
  WITH src AS (
    SELECT DISTINCT ON (a.donor_id)
           a.donor_id, a.id AS source_assignment_id, a.station
      FROM fro_assignments a
     WHERE a.ngo_id = $1
     ORDER BY a.donor_id, a.assigned_at DESC, a.id DESC
  ),
  src_aod AS (
    SELECT * FROM src WHERE station ~ $2
  ),
  bsct AS (
    SELECT DISTINCT ON (a.donor_id)
           a.donor_id, a.id, a.station, a.fro_worker_id, a.status AS bsct_status
      FROM fro_assignments a
     WHERE a.ngo_id = $3
     ORDER BY a.donor_id, a.assigned_at DESC, a.id DESC
  ),
  bod AS (
    SELECT donor_id FROM bsct WHERE station ~ '^BOD-([1-9]|1[0-8])$'
  ),
  u AS (
    SELECT s.donor_id, s.source_assignment_id
      FROM src_aod s
     WHERE NOT EXISTS (SELECT 1 FROM bod b WHERE b.donor_id = s.donor_id)
  ),
  rec AS (
    SELECT r.donor_id, count(*)::int AS cnt, sum(r.amount)::numeric AS total
      FROM receipts r
     WHERE r.project_id = $4
       AND r.donor_id IS NOT NULL
       AND r.voided_at IS NULL
       AND COALESCE(r.amount, 0) > 0
     GROUP BY r.donor_id
  )
  SELECT u.donor_id, u.source_assignment_id,
         d.name, d.mobile_number,
         CASE
           WHEN COALESCE(rec.cnt, 0) = 0 OR COALESCE(rec.total, 0) <= 0 THEN 'below'
           WHEN rec.total / rec.cnt >= 5000 THEN 'premium'
           WHEN rec.total / rec.cnt >= 2000 THEN 'high'
           WHEN rec.total / rec.cnt >= 500 THEN 'medium'
           WHEN rec.total / rec.cnt >= 251 THEN 'low'
           ELSE 'below'
         END AS category,
         bsct.id AS bsct_assignment_id,
         bsct.station AS bsct_station,
         bsct.fro_worker_id AS bsct_fro_worker_id,
         (
           COALESCE(bsct.bsct_status, '') = 'dnd'
           OR EXISTS (
             SELECT 1 FROM donor_dnd dd
              WHERE dd.donor_id = u.donor_id
                AND dd.ngo_id = $3
                AND dd.released_at IS NULL
           )
         ) AS bsct_dnd
    FROM u
    JOIN donor_profiles d ON d.id = u.donor_id
    LEFT JOIN rec ON rec.donor_id = u.donor_id
    LEFT JOIN bsct ON bsct.donor_id = u.donor_id
`;

const categoryCounts = (rows) => {
  const c = { all: rows.length, premium: 0, high: 0, medium: 0, low: 0, below: 0 };
  for (const r of rows) c[r.category] = (c[r.category] || 0) + 1;
  return c;
};

export const previewUniqueDonors = async (req, res) => {
  try {
    const allowed = await getUserNgoIds(req.user);
    const sourceNgo = await loadNgo(req.query.source_ngo_id, allowed);
    if (!sourceNgo) return res.status(403).json({ message: 'Source NGO access denied' });
    const prefix = sourcePrefix(sourceNgo.code);
    if (!prefix) return res.status(400).json({ message: 'Unique-donor tool supports AFLF and MANN only' });

    const bsct = (await db._pool.query(`select id, code from ngos where code='BSCT'`)).rows[0];
    if (!bsct) return res.status(400).json({ message: 'BSCT NGO not found' });

    const filter = String(req.query.filter || 'all').toLowerCase();
    const target = String(req.query.target_station || '').trim() || null;
    const { rows } = await db._pool.query(UNIQUE_SQL, [sourceNgo.id, `^${prefix}-([1-9]|1[0-8])$`, bsct.id, String(sourceNgo.code).toLowerCase()]);
    // Donors already marked DND in BSCT must never be pushed back to BSCT.
    const dndRows = rows.filter(r => r.bsct_dnd);
    const eligibleRows = rows.filter(r => !r.bsct_dnd);
    const counts = categoryCounts(eligibleRows);
    const matched = filter === 'all' ? eligibleRows : eligibleRows.filter(r => r.category === filter);
    return res.json({
      source_ngo_id: sourceNgo.id,
      source_ngo_code: sourceNgo.code,
      target_ngo_id: bsct.id,
      target_station: target,
      filter,
      counts,
      matched: matched.length,
      existing_bsct: matched.filter(r => r.bsct_assignment_id).length,
      new_assignments: matched.filter(r => !r.bsct_assignment_id).length,
      eligible: matched.length,
      total_unique: rows.length,
      excluded_bsct_dnd: dndRows.length,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

export const addUniqueDonorsToBsct = async (req, res) => {
  const client = await db._pool.connect();
  try {
    const allowed = await getUserNgoIds(req.user);
    const sourceNgo = await loadNgo(req.body?.source_ngo_id, allowed);
    if (!sourceNgo) return res.status(403).json({ message: 'Source NGO access denied' });
    const prefix = sourcePrefix(sourceNgo.code);
    if (!prefix) return res.status(400).json({ message: 'Unique-donor tool supports AFLF and MANN only' });

    const bsct = (await db._pool.query(`select id from ngos where code='BSCT'`)).rows[0];
    if (!bsct) return res.status(400).json({ message: 'BSCT NGO not found' });

    const target = String(req.body?.target_station || '').trim();
    const filter = String(req.body?.filter || 'all').toLowerCase();
    if (!target) return res.status(400).json({ message: 'Target BSCT station required' });
    if (!/^BOD-\d+$/i.test(target)) return res.status(400).json({ message: 'Target must be a BSCT BOD station' });
    if (!FILTERS.has(filter)) return res.status(400).json({ message: 'Invalid filter' });

    const assignedBy = await resolveUserUuid(req.user);
    const { rows: targetFro } = await db._pool.query(
      `select fro_worker_id from fro_station_assignments where station=$1 and ngo_id=$2 limit 1`,
      [target, bsct.id],
    );
    const targetFroId = targetFro[0]?.fro_worker_id || null;

    await client.query('BEGIN');
    const { rows } = await client.query(UNIQUE_SQL, [sourceNgo.id, `^${prefix}-([1-9]|1[0-8])$`, bsct.id, String(sourceNgo.code).toLowerCase()]);
    const dndRows = rows.filter(r => r.bsct_dnd);
    const eligibleRows = rows.filter(r => !r.bsct_dnd);
    const matched = filter === 'all' ? eligibleRows : eligibleRows.filter(r => r.category === filter);
    if (matched.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: dndRows.length
          ? `All ${dndRows.length} matching unique donor(s) are already marked DND in BSCT — nothing was sent.`
          : 'No unique donors match this filter.',
        excluded_bsct_dnd: dndRows.length,
      });
    }

    const additionId = crypto.randomUUID();
    await client.query(
      `INSERT INTO unique_donor_additions
         (id, source_ngo_id, target_ngo_id, target_station, filter_key, donor_count, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'active',$7)`,
      [additionId, sourceNgo.id, bsct.id, target, filter, matched.length, assignedBy],
    );

    let moved = 0;
    let created = 0;
    const touchedFroIds = new Set();
    if (targetFroId) touchedFroIds.add(targetFroId);
    for (const r of matched) {
      let assignmentId = r.bsct_assignment_id;
      let mode = 'moved';
      let originalStation = r.bsct_station;
      let originalFro = r.bsct_fro_worker_id;
      if (assignmentId) {
        if (r.bsct_fro_worker_id) touchedFroIds.add(r.bsct_fro_worker_id);
        await client.query(
          `UPDATE fro_assignments
              SET station=$1, fro_worker_id=$2, assigned_at=now(), assigned_by=$3
            WHERE id=$4 AND (status IS NULL OR status <> 'reassigned')`,
          [target, targetFroId, assignedBy, assignmentId],
        );
        moved++;
      } else {
        const ins = await client.query(
          `INSERT INTO fro_assignments
             (donor_id, fro_worker_id, ngo_id, station, status, assigned_by, assigned_at, batch_type, is_new)
           VALUES ($1,$2,$3,$4,'pending',$5,now(),'new_data',true)
           RETURNING id`,
          [r.donor_id, targetFroId, bsct.id, target, assignedBy],
        );
        assignmentId = ins.rows[0].id;
        mode = 'created';
        originalStation = null;
        originalFro = null;
        created++;
      }
      await client.query(
        `INSERT INTO unique_donor_addition_items
           (addition_id, donor_id, bsct_assignment_id, mode, original_station, original_fro_worker_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [additionId, r.donor_id, assignmentId, mode, originalStation, originalFro],
      );
    }

    await client.query('COMMIT');
    bustStationCache();
    for (const id of touchedFroIds) invalidateFroCaches(id);
    return res.json({
      addition_id: additionId,
      added: matched.length,
      moved,
      created,
      skipped_bsct_dnd: dndRows.length,
      target_station: target,
      source_ngo_code: sourceNgo.code,
      filter,
      message: `${matched.length} unique ${sourceNgo.code} donor(s) added to ${target} (${moved} moved, ${created} new)`,
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ message: e.message });
  } finally {
    client.release();
  }
};

export const listUniqueDonorAdditions = async (req, res) => {
  try {
    const allowed = await getUserNgoIds(req.user);
    if (allowed.length === 0) return res.json([]);
    const { rows } = await db._pool.query(
      `SELECT u.*, s.code AS source_ngo_code, t.code AS target_ngo_code,
              count(i.id)::int AS items_total,
              count(i.id) FILTER (WHERE i.restored)::int AS items_restored
         FROM unique_donor_additions u
         JOIN ngos s ON s.id = u.source_ngo_id
         JOIN ngos t ON t.id = u.target_ngo_id
         LEFT JOIN unique_donor_addition_items i ON i.addition_id = u.id
        WHERE u.source_ngo_id = ANY($1::uuid[]) OR u.target_ngo_id = ANY($1::uuid[])
        GROUP BY u.id, s.code, t.code
        ORDER BY u.created_at DESC`,
      [allowed],
    );
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

export const restoreUniqueDonorAddition = async (req, res) => {
  const client = await db._pool.connect();
  try {
    const allowed = await getUserNgoIds(req.user);
    const assignedBy = await resolveUserUuid(req.user);
    const { rows } = await client.query(
      `SELECT * FROM unique_donor_additions WHERE id=$1 AND source_ngo_id = ANY($2::uuid[])`,
      [req.params.id, allowed],
    );
    const addition = rows[0];
    if (!addition) return res.status(404).json({ message: 'Addition not found' });
    if (addition.status === 'restored') return res.status(400).json({ message: 'Already restored' });

    await client.query('BEGIN');
    const { rows: items } = await client.query(
      `SELECT * FROM unique_donor_addition_items WHERE addition_id=$1 AND restored=false ORDER BY id`,
      [addition.id],
    );
    let restored = 0;
    let skipped = 0;
    const touchedFroIds = new Set();
    for (const item of items) {
      const { rows: cur } = await client.query(`SELECT id, station, status, fro_worker_id FROM fro_assignments WHERE id=$1`, [item.bsct_assignment_id]);
      const a = cur[0];
      if (!a || a.status === 'reassigned') { skipped++; continue; }
      if (a.fro_worker_id) touchedFroIds.add(a.fro_worker_id);
      if (item.mode === 'created') {
        await client.query(`UPDATE fro_assignments SET status='reassigned' WHERE id=$1`, [a.id]);
      } else {
        await client.query(
          `UPDATE fro_assignments SET station=$1, fro_worker_id=$2, assigned_at=now(), assigned_by=$3 WHERE id=$4`,
          [item.original_station, item.original_fro_worker_id || null, assignedBy, a.id],
        );
        if (item.original_fro_worker_id) touchedFroIds.add(item.original_fro_worker_id);
      }
      await client.query(
        `UPDATE unique_donor_addition_items SET restored=true, restored_at=now(), restored_by=$1 WHERE id=$2`,
        [assignedBy, item.id],
      );
      restored++;
    }
    const nextStatus = restored === items.length ? 'restored' : 'partial';
    await client.query(
      `UPDATE unique_donor_additions SET status=$1, restored_at=now(), restored_by=$2 WHERE id=$3`,
      [nextStatus, assignedBy, addition.id],
    );
    await client.query('COMMIT');
    bustStationCache();
    for (const id of touchedFroIds) invalidateFroCaches(id);
    return res.json({ restored, skipped, status: nextStatus, addition_id: addition.id });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ message: e.message });
  } finally {
    client.release();
  }
};
