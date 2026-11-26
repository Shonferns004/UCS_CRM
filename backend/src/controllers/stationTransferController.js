import crypto from 'crypto';
import db from '../config/db.js';
import { getUserNgoIds, bustStationCache } from './ngoAdminController.js';
import { invalidateFroCaches } from './froController.js';

const FILTERS = new Set(['all', 'premium', 'high', 'medium', 'low', 'below']);
const parseList = (v) => [...new Set(
  String(Array.isArray(v) ? v.join(',') : v ?? '')
    .split(',').map(s => s.trim()).filter(Boolean),
)];

const resolveUserUuid = async (user) => {
  if (!user?.id) return null;
  const { rows } = await db._pool.query(`select id from users where id = $1`, [user.id]);
  return rows[0]?.id || null;
};

const loadNgo = async (ngoId, allowedNgoIds) => {
  if (!ngoId || !allowedNgoIds.includes(ngoId)) return null;
  const { rows } = await db._pool.query(`select id, code from ngos where id = $1`, [ngoId]);
  return rows[0] || null;
};

// One statement computes the source station's live leads, their average-donation
// category (from receipts of THIS NGO only), and whether the donor is already
// active on the target station. Returns one row per donor (latest assignment).
const STATION_LEADS_SQL = `
  WITH src AS (
    SELECT DISTINCT ON (a.donor_id)
           a.id AS assignment_id, a.donor_id, a.status, a.fro_worker_id
      FROM fro_assignments a
     WHERE a.station = $1
       AND a.ngo_id = $2
       AND (a.status IS NULL OR a.status <> 'reassigned')
     ORDER BY a.donor_id, a.assigned_at DESC, a.id DESC
  ),
  rec AS (
    SELECT r.donor_id,
           count(*)::int AS cnt,
           sum(r.amount)::numeric AS total
      FROM receipts r
     WHERE r.project_id = $3
       AND r.donor_id IS NOT NULL
       AND r.voided_at IS NULL
       AND COALESCE(r.amount, 0) > 0
     GROUP BY r.donor_id
  ),
  bsct_rec AS (
    SELECT COALESCE(r.donor_id, d.id) AS donor_id,
           count(*)::int AS cnt,
           sum(r.amount)::numeric AS total
      FROM receipts r
      LEFT JOIN donor_profiles d
        ON r.donor_id IS NULL AND d.mobile_number = r.donor_mobile
     WHERE r.project_id = 'bsct'
       AND r.voided_at IS NULL
       AND COALESCE(r.amount, 0) > 0
       AND (r.donor_id IS NOT NULL OR d.id IS NOT NULL)
     GROUP BY COALESCE(r.donor_id, d.id)
  ),
  cat AS (
    SELECT s.*,
           CASE
             WHEN COALESCE(rec.cnt, 0) = 0 OR COALESCE(rec.total, 0) <= 0 THEN 'below'
             WHEN rec.total / rec.cnt >= 5000 THEN 'premium'
             WHEN rec.total / rec.cnt >= 2000 THEN 'high'
             WHEN rec.total / rec.cnt >= 500 THEN 'medium'
             WHEN rec.total / rec.cnt >= 251 THEN 'low'
             ELSE 'below'
           END AS category,
           CASE
             WHEN COALESCE(bsct_rec.cnt, 0) = 0 OR COALESCE(bsct_rec.total, 0) <= 0 THEN 'below'
             WHEN bsct_rec.total / bsct_rec.cnt >= 5000 THEN 'premium'
             WHEN bsct_rec.total / bsct_rec.cnt >= 2000 THEN 'high'
             WHEN bsct_rec.total / bsct_rec.cnt >= 500 THEN 'medium'
             WHEN bsct_rec.total / bsct_rec.cnt >= 251 THEN 'low'
             ELSE 'below'
           END AS bsct_category,
           CASE
             WHEN $4::text[] IS NULL OR cardinality($4::text[]) = 0 THEN false
             ELSE EXISTS (
               SELECT 1 FROM fro_assignments t
                WHERE t.donor_id = s.donor_id
                  AND t.ngo_id = $2
                  AND t.station = ANY($4::text[])
                  AND t.id <> s.assignment_id
                  AND (t.status IS NULL OR t.status <> 'reassigned')
             )
           END AS at_target
      FROM src s
      LEFT JOIN rec ON rec.donor_id = s.donor_id
      LEFT JOIN bsct_rec ON bsct_rec.donor_id = s.donor_id
  )
  SELECT c.assignment_id, c.donor_id, c.status, c.fro_worker_id, c.category, c.bsct_category, c.at_target,
         d.name, d.mobile_number
    FROM cat c
    JOIN donor_profiles d ON d.id = c.donor_id
`;

const MULTI_STATION_LEADS_SQL = `
  WITH src AS (
    SELECT DISTINCT ON (a.donor_id)
           a.donor_id, a.id AS assignment_id, a.status, a.fro_worker_id, a.station AS source_station
      FROM fro_assignments a
     WHERE a.ngo_id = $2
       AND a.station = ANY($1::text[])
       AND (a.status IS NULL OR a.status <> 'reassigned')
     ORDER BY a.donor_id, a.assigned_at DESC, a.id DESC
  ),
  rec AS (
    SELECT r.donor_id,
           count(*)::int AS cnt,
           sum(r.amount)::numeric AS total
      FROM receipts r
     WHERE r.project_id = $5
       AND r.donor_id IS NOT NULL
       AND r.voided_at IS NULL
       AND COALESCE(r.amount, 0) > 0
     GROUP BY r.donor_id
  ),
  bsct_rec AS (
    SELECT COALESCE(r.donor_id, d.id) AS donor_id,
           count(*)::int AS cnt,
           sum(r.amount)::numeric AS total
      FROM receipts r
      LEFT JOIN donor_profiles d
        ON r.donor_id IS NULL AND d.mobile_number = r.donor_mobile
     WHERE r.project_id = 'bsct'
       AND r.voided_at IS NULL
       AND COALESCE(r.amount, 0) > 0
       AND (r.donor_id IS NOT NULL OR d.id IS NOT NULL)
     GROUP BY COALESCE(r.donor_id, d.id)
  ),
  cat AS (
    SELECT s.*,
           CASE
             WHEN COALESCE(rec.cnt, 0) = 0 OR COALESCE(rec.total, 0) <= 0 THEN 'below'
             WHEN rec.total / rec.cnt >= 5000 THEN 'premium'
             WHEN rec.total / rec.cnt >= 2000 THEN 'high'
             WHEN rec.total / rec.cnt >= 500 THEN 'medium'
             WHEN rec.total / rec.cnt >= 251 THEN 'low'
             ELSE 'below'
           END AS category,
           CASE
             WHEN COALESCE(bsct_rec.cnt, 0) = 0 OR COALESCE(bsct_rec.total, 0) <= 0 THEN 'below'
             WHEN bsct_rec.total / bsct_rec.cnt >= 5000 THEN 'premium'
             WHEN bsct_rec.total / bsct_rec.cnt >= 2000 THEN 'high'
             WHEN bsct_rec.total / bsct_rec.cnt >= 500 THEN 'medium'
             WHEN bsct_rec.total / bsct_rec.cnt >= 251 THEN 'low'
             ELSE 'below'
           END AS bsct_category,
           CASE
             WHEN $4::text[] IS NULL OR cardinality($4::text[]) = 0 THEN false
             ELSE EXISTS (
               SELECT 1 FROM fro_assignments t
                WHERE t.donor_id = s.donor_id
                  AND t.ngo_id = $3
                  AND t.station = ANY($4::text[])
                  AND t.id <> s.assignment_id
                  AND (t.status IS NULL OR t.status <> 'reassigned')
             )
           END AS at_target
      FROM src s
      LEFT JOIN rec ON rec.donor_id = s.donor_id
      LEFT JOIN bsct_rec ON bsct_rec.donor_id = s.donor_id
  )
  SELECT c.assignment_id, c.donor_id, c.status, c.fro_worker_id, c.source_station,
         c.category, c.bsct_category, c.at_target,
         d.name, d.mobile_number
    FROM cat c
    JOIN donor_profiles d ON d.id = c.donor_id
`;

const categoryCounts = (rows, field = 'category') => {
  const counts = { all: rows.length, premium: 0, high: 0, medium: 0, low: 0, below: 0 };
  for (const r of rows) {
    const key = r[field];
    if (counts[key] !== undefined) counts[key] += 1;
    else counts.below += 1;
  }
  return counts;
};

export const previewStationTransfer = async (req, res) => {
  try {
    const allowed = await getUserNgoIds(req.user);
    const ngo = await loadNgo(req.query.ngo_id, allowed);
    if (!ngo) return res.status(403).json({ message: 'NGO access denied' });
    const station = String(req.params.station || '').trim();
    const rawTargets = req.query.target_stations ?? req.query.target_station ?? '';
    const targetList = [...new Set(
      String(Array.isArray(rawTargets) ? rawTargets.join(',') : rawTargets)
        .split(',').map(s => s.trim()).filter(Boolean),
    )].filter(t => t !== station);
    const target = targetList.join(', ') || null;
    const filter = String(req.query.filter || 'all').toLowerCase();
    const bsctFilter = String(req.query.bsct_filter || 'all').toLowerCase();
    if (!station) return res.status(400).json({ message: 'Station required' });
    if (targetList.includes(station)) return res.status(400).json({ message: 'Target must differ from source' });

    const { rows } = await db._pool.query(STATION_LEADS_SQL, [
      station, ngo.id, String(ngo.code).toLowerCase(),
      targetList.length ? targetList : null,
    ]);
    const { rows: targetFroRows } = await db._pool.query(
      `select station, fro_worker_id from fro_station_assignments
        where station = ANY($1::text[]) and ngo_id=$2`,
      [targetList.length ? targetList : [''], ngo.id],
    );
    const targetFroMap = new Map((targetFroRows || []).map(r => [r.station, r.fro_worker_id]));
    const targetFros = targetList.map(st => ({ station: st, fro_worker_id: targetFroMap.get(st) || null }));
    const counts = categoryCounts(rows);
    const primaryMatched = filter === 'all' ? rows : rows.filter(r => r.category === filter);
    const bsctCounts = categoryCounts(primaryMatched, 'bsct_category');
    const crossNgo = String(ngo.code).toUpperCase() !== 'BSCT';
    const selected = crossNgo && bsctFilter !== 'all'
      ? primaryMatched.filter(r => r.bsct_category === bsctFilter)
      : primaryMatched;
    const eligibleRows = selected.filter(r => !r.at_target);
    const eligible = eligibleRows.length;
    const distribution = targetList.length
      ? targetList.map((st, i) => {
        const base = Math.floor(eligible / targetList.length);
        const rem = eligible % targetList.length;
        return { station: st, count: base + (i < rem ? 1 : 0) };
      })
      : [];
    return res.json({
      station,
      ngo_id: ngo.id,
      ngo_code: ngo.code,
      target_station: target,
      target_stations: targetList,
      target_fros: targetFros,
      filter,
      bsct_filter: bsctFilter,
      cross_ngo: crossNgo,
      counts,
      bsct_counts: bsctCounts,
      source_matched: primaryMatched.length,
      matched: selected.length,
      eligible,
      skipped_at_target: selected.length - eligible,
      distribution,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

export const transferStationLeads = async (req, res) => {
  const client = await db._pool.connect();
  try {
    const allowed = await getUserNgoIds(req.user);
    const ngo = await loadNgo(req.body?.ngo_id, allowed);
    if (!ngo) return res.status(403).json({ message: 'NGO access denied' });

    const source = String(req.params.station || '').trim();
    const rawTargets = req.body?.target_stations ?? req.body?.target_station ?? '';
    const targetList = [...new Set(
      String(Array.isArray(rawTargets) ? rawTargets.join(',') : rawTargets)
        .split(',').map(s => s.trim()).filter(Boolean),
    )].filter(t => t !== source);
    const filter = String(req.body?.filter || 'all').toLowerCase();
    const bsctFilter = String(req.body?.bsct_filter || 'all').toLowerCase();
    if (!source || targetList.length === 0) return res.status(400).json({ message: 'Source and at least one target station required' });
    if (!FILTERS.has(filter)) return res.status(400).json({ message: 'Invalid filter' });
    if (!FILTERS.has(bsctFilter)) return res.status(400).json({ message: 'Invalid BSCT filter' });

    const assignedBy = await resolveUserUuid(req.user);
    const { rows: targetFros } = await db._pool.query(
      `select station, fro_worker_id from fro_station_assignments
        where station = ANY($1::text[]) and ngo_id=$2`,
      [targetList, ngo.id],
    );
    const froByStation = new Map((targetFros || []).map(r => [r.station, r.fro_worker_id]));

    await client.query('BEGIN');
    // Lock every live source assignment for this (station, ngo) pair first.
    // A CTE cannot be locked with FOR UPDATE, so lock the base rows here and
    // then run the category query against a stable snapshot.
    await client.query(
      `SELECT id FROM fro_assignments
        WHERE station=$1 AND ngo_id=$2
          AND (status IS NULL OR status <> 'reassigned')
        FOR UPDATE`,
      [source, ngo.id],
    );
    const { rows: allRows } = await client.query(
      STATION_LEADS_SQL,
      [source, ngo.id, String(ngo.code).toLowerCase(), targetList],
    );
    const matched = filter === 'all' ? allRows : allRows.filter(r => r.category === filter);
    const crossNgo = String(ngo.code).toUpperCase() !== 'BSCT';
    const bsctMatched = crossNgo && bsctFilter !== 'all'
      ? matched.filter(r => r.bsct_category === bsctFilter)
      : matched;
    const rows = bsctMatched.filter(r => !r.at_target);
    const targetLabel = targetList.join(', ');
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: bsctMatched.length
          ? `All ${bsctMatched.length} matching lead(s) are already active on the selected target station(s) — nothing moved.`
          : 'No leads match this filter on the source station.',
      });
    }

    const { rows: sourceFroRows } = await client.query(
      `select fro_worker_id from fro_station_assignments where station=$1 and ngo_id=$2 limit 1`,
      [source, ngo.id],
    );
    const sourceFroId = sourceFroRows[0]?.fro_worker_id
      || rows.find(r => r.fro_worker_id)?.fro_worker_id
      || null;
    if (!sourceFroId && !targetList.some(st => froByStation.get(st))) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'No FRO is assigned to the source or target station. Assign a FRO first, then transfer.',
      });
    }

    // Equal split across the selected stations. Remainder goes to the first
    // stations, so the total is always exactly rows.length.
    const n = targetList.length;
    const base = Math.floor(rows.length / n);
    const rem = rows.length % n;
    const buckets = targetList.map((station, i) => ({
      station,
      fro: froByStation.get(station) || sourceFroId,
      count: base + (i < rem ? 1 : 0),
    }));

    const transferId = crypto.randomUUID();
    await client.query(
      `INSERT INTO station_lead_transfers
         (id, ngo_id, source_station, target_station, filter_key, bsct_filter_key, donor_count, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8)`,
      [transferId, ngo.id, source, targetLabel, filter, crossNgo ? bsctFilter : 'all', rows.length, assignedBy],
    );

    const distribution = [];
    let cursor = 0;
    for (const bucket of buckets) {
      // If the target station had no FRO, the source FRO takes it so the moved
      // leads are owned and visible in that station's scope.
      if (!froByStation.get(bucket.station) && bucket.fro) {
        const upd = await client.query(
          `UPDATE fro_station_assignments SET fro_worker_id=$1, updated_at=now()
            WHERE station=$2 AND ngo_id=$3`,
          [bucket.fro, bucket.station, ngo.id],
        );
        if (upd.rowCount === 0) {
          await client.query(
            `INSERT INTO fro_station_assignments (fro_worker_id, ngo_id, station, assigned_by)
             VALUES ($1,$2,$3,$4)`,
            [bucket.fro, ngo.id, bucket.station, assignedBy],
          );
        }
        froByStation.set(bucket.station, bucket.fro);
      }
      const slice = rows.slice(cursor, cursor + bucket.count);
      cursor += bucket.count;
      distribution.push({ station: bucket.station, count: slice.length, fro_worker_id: bucket.fro });
      for (const r of slice) {
        await client.query(
          `INSERT INTO station_lead_transfer_items
             (transfer_id, assignment_id, donor_id, source_station, target_station, source_fro_worker_id, original_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [transferId, r.assignment_id, r.donor_id, source, bucket.station, r.fro_worker_id, r.status],
        );
        await client.query(
          `UPDATE fro_assignments
              SET station=$1, fro_worker_id=$2, assigned_at=now(), assigned_by=$3
            WHERE id=$4 AND (status IS NULL OR status <> 'reassigned')`,
          [bucket.station, bucket.fro, assignedBy, r.assignment_id],
        );
      }
    }

    await client.query('COMMIT');
    bustStationCache();
    const touchedFroIds = new Set(rows.map(r => r.fro_worker_id).filter(Boolean));
    if (sourceFroId) touchedFroIds.add(sourceFroId);
    for (const fro of froByStation.values()) if (fro) touchedFroIds.add(fro);
    for (const id of touchedFroIds) invalidateFroCaches(id);
    return res.json({
      message: `Transferred ${rows.length} lead(s) from ${source} to ${targetLabel}`,
      transfer_id: transferId,
      moved: rows.length,
      skipped_at_target: bsctMatched.length - rows.length,
      source_station: source,
      target_station: targetLabel,
      target_stations: targetList,
      distribution,
      filter,
      bsct_filter: crossNgo ? bsctFilter : 'all',
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ message: e.message });
  } finally {
    client.release();
  }
};

export const listStationTransfers = async (req, res) => {
  try {
    const allowed = await getUserNgoIds(req.user);
    if (allowed.length === 0) return res.json([]);
    const { rows } = await db._pool.query(
      `SELECT t.*, n.code AS ngo_code,
              count(i.id)::int AS items_total,
              count(i.id) FILTER (WHERE i.restored)::int AS items_restored
         FROM station_lead_transfers t
         JOIN ngos n ON n.id = t.ngo_id
         LEFT JOIN station_lead_transfer_items i ON i.transfer_id = t.id
        WHERE t.ngo_id = ANY($1::uuid[])
        GROUP BY t.id, n.code
        ORDER BY t.created_at DESC`,
      [allowed],
    );
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

export const listStationTransferDonors = async (req, res) => {
  try {
    const allowed = await getUserNgoIds(req.user);
    if (allowed.length === 0) return res.json([]);
    const { rows } = await db._pool.query(
      `SELECT i.donor_id, i.assignment_id, i.source_station, i.target_station,
              i.restored, i.restored_at, d.name, d.mobile_number
         FROM station_lead_transfer_items i
         JOIN station_lead_transfers t ON t.id = i.transfer_id
         LEFT JOIN donor_profiles d ON d.id = i.donor_id
        WHERE i.transfer_id = $1 AND t.ngo_id = ANY($2::uuid[])
        ORDER BY d.name NULLS LAST`,
      [req.params.id, allowed],
    );
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

export const restoreStationTransfer = async (req, res) => {
  const client = await db._pool.connect();
  try {
    const allowed = await getUserNgoIds(req.user);
    const assignedBy = await resolveUserUuid(req.user);
    const { rows: transfers } = await client.query(
      `SELECT * FROM station_lead_transfers WHERE id=$1 AND ngo_id = ANY($2::uuid[])`,
      [req.params.id, allowed],
    );
    const transfer = transfers[0];
    if (!transfer) return res.status(404).json({ message: 'Transfer not found' });
    if (transfer.status === 'restored') return res.status(400).json({ message: 'Already restored' });

    await client.query('BEGIN');
    const { rows: items } = await client.query(
      `SELECT * FROM station_lead_transfer_items
        WHERE transfer_id=$1 AND restored=false
        ORDER BY id`,
      [transfer.id],
    );

    let restored = 0;
    let skipped = 0;
    const touchedFroIds = new Set();
    for (const item of items) {
      const sourceStation = item.source_station || transfer.source_station;
      const { rows: current } = await client.query(
        `SELECT id, station, status, fro_worker_id FROM fro_assignments WHERE id=$1`,
        [item.assignment_id],
      );
      const a = current[0];
      if (!a || a.station !== item.target_station || a.status === 'reassigned') {
        skipped++;
        continue;
      }
      if (a.fro_worker_id) touchedFroIds.add(a.fro_worker_id);
      const { rows: dup } = await client.query(
        `SELECT 1 FROM fro_assignments
          WHERE donor_id=$1 AND ngo_id=$2 AND station=$3 AND id <> $4
            AND (status IS NULL OR status <> 'reassigned')
          LIMIT 1`,
        [item.donor_id, transfer.ngo_id, sourceStation, item.assignment_id],
      );
      if (dup.length > 0) {
        skipped++;
        continue;
      }
      let sourceFroId = item.source_fro_worker_id || null;
      if (!sourceFroId) {
        const { rows: sf } = await client.query(
          `SELECT fro_worker_id FROM fro_station_assignments
            WHERE station=$1 AND ngo_id=$2 LIMIT 1`,
          [sourceStation, transfer.ngo_id],
        );
        sourceFroId = sf[0]?.fro_worker_id || null;
      }
      if (sourceFroId) touchedFroIds.add(sourceFroId);
      await client.query(
        `UPDATE fro_assignments
            SET station=$1, fro_worker_id=$2, assigned_at=now(), assigned_by=$3
          WHERE id=$4`,
        [sourceStation, sourceFroId, assignedBy, item.assignment_id],
      );
      await client.query(
        `UPDATE station_lead_transfer_items
            SET restored=true, restored_at=now(), restored_by=$1
          WHERE id=$2`,
        [assignedBy, item.id],
      );
      restored++;
    }

    const done = restored + skipped;
    const nextStatus = restored === items.length || (done === items.length && skipped === 0)
      ? 'restored'
      : 'partial';
    await client.query(
      `UPDATE station_lead_transfers
          SET status=$1, restored_at=now(), restored_by=$2
        WHERE id=$3`,
      [nextStatus, assignedBy, transfer.id],
    );
    await client.query('COMMIT');
    bustStationCache();
    for (const id of touchedFroIds) invalidateFroCaches(id);
    return res.json({ restored, skipped, status: nextStatus, transfer_id: transfer.id });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ message: e.message });
  } finally {
    client.release();
  }
};

export const previewMultiStationTransfer = async (req, res) => {
  try {
    const allowed = await getUserNgoIds(req.user);
    const ngo = await loadNgo(req.query.ngo_id, allowed);
    if (!ngo) return res.status(403).json({ message: 'NGO access denied' });
    const sources = parseList(req.query.source_stations);
    if (sources.length === 0) return res.status(400).json({ message: 'Select at least one source station' });
    const targets = parseList(req.query.target_stations).filter(t => !sources.includes(t));
    const filter = String(req.query.filter || 'all').toLowerCase();
    const bsctFilter = String(req.query.bsct_filter || 'all').toLowerCase();

    const { rows } = await db._pool.query(MULTI_STATION_LEADS_SQL, [
      sources, ngo.id, ngo.id, targets.length ? targets : null, String(ngo.code).toLowerCase(),
    ]);
    const { rows: targetFroRows } = await db._pool.query(
      `select station, fro_worker_id from fro_station_assignments
        where station = ANY($1::text[]) and ngo_id=$2`,
      [targets.length ? targets : [''], ngo.id],
    );
    const targetFroMap = new Map((targetFroRows || []).map(r => [r.station, r.fro_worker_id]));
    const counts = categoryCounts(rows);
    const primaryMatched = filter === 'all' ? rows : rows.filter(r => r.category === filter);
    const bsctCounts = categoryCounts(primaryMatched, 'bsct_category');
    const crossNgo = String(ngo.code).toUpperCase() !== 'BSCT';
    const selected = crossNgo && bsctFilter !== 'all'
      ? primaryMatched.filter(r => r.bsct_category === bsctFilter)
      : primaryMatched;
    const eligibleRows = selected.filter(r => !r.at_target);
    const eligible = eligibleRows.length;
    const distribution = targets.length
      ? targets.map((st, i) => {
        const base = Math.floor(eligible / targets.length);
        const rem = eligible % targets.length;
        return { station: st, count: base + (i < rem ? 1 : 0), fro_worker_id: targetFroMap.get(st) || null };
      })
      : [];
    return res.json({
      source_stations: sources,
      target_stations: targets,
      ngo_id: ngo.id,
      ngo_code: ngo.code,
      filter,
      bsct_filter: bsctFilter,
      cross_ngo: crossNgo,
      counts,
      bsct_counts: bsctCounts,
      matched: selected.length,
      eligible,
      skipped_at_target: selected.length - eligible,
      distribution,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

export const transferMultiStationLeads = async (req, res) => {
  const client = await db._pool.connect();
  try {
    const allowed = await getUserNgoIds(req.user);
    const ngo = await loadNgo(req.body?.ngo_id, allowed);
    if (!ngo) return res.status(403).json({ message: 'NGO access denied' });
    const sources = parseList(req.body?.source_stations);
    const targets = parseList(req.body?.target_stations).filter(t => !sources.includes(t));
    const filter = String(req.body?.filter || 'all').toLowerCase();
    const bsctFilter = String(req.body?.bsct_filter || 'all').toLowerCase();
    if (sources.length === 0) return res.status(400).json({ message: 'Select at least one source station' });
    if (targets.length === 0) return res.status(400).json({ message: 'Select at least one target station' });
    if (!FILTERS.has(filter)) return res.status(400).json({ message: 'Invalid filter' });
    if (!FILTERS.has(bsctFilter)) return res.status(400).json({ message: 'Invalid BSCT filter' });

    const assignedBy = await resolveUserUuid(req.user);
    const { rows: targetFros } = await db._pool.query(
      `select station, fro_worker_id from fro_station_assignments
        where station = ANY($1::text[]) and ngo_id=$2`,
      [targets, ngo.id],
    );
    const froByStation = new Map((targetFros || []).map(r => [r.station, r.fro_worker_id]));

    await client.query('BEGIN');
    await client.query(
      `SELECT id FROM fro_assignments
        WHERE station = ANY($1::text[]) AND ngo_id=$2
          AND (status IS NULL OR status <> 'reassigned')
        FOR UPDATE`,
      [sources, ngo.id],
    );
    const { rows: allRows } = await client.query(MULTI_STATION_LEADS_SQL, [
      sources, ngo.id, ngo.id, targets, String(ngo.code).toLowerCase(),
    ]);
    const matched = filter === 'all' ? allRows : allRows.filter(r => r.category === filter);
    const crossNgo = String(ngo.code).toUpperCase() !== 'BSCT';
    const bsctMatched = crossNgo && bsctFilter !== 'all'
      ? matched.filter(r => r.bsct_category === bsctFilter)
      : matched;
    const rows = bsctMatched.filter(r => !r.at_target);
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: bsctMatched.length
          ? `All ${bsctMatched.length} matching lead(s) are already active on the selected target station(s) â€” nothing moved.`
          : 'No leads match this filter on the selected source station(s).',
      });
    }

    const fallbackFro = rows.find(r => r.fro_worker_id)?.fro_worker_id || null;
    if (!fallbackFro && !targets.some(st => froByStation.get(st))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'No FRO is assigned to the source or target station. Assign a FRO first, then transfer.' });
    }

    const n = targets.length;
    const base = Math.floor(rows.length / n);
    const rem = rows.length % n;
    const buckets = targets.map((station, i) => ({
      station,
      fro: froByStation.get(station) || fallbackFro,
      count: base + (i < rem ? 1 : 0),
    }));

    const transferId = crypto.randomUUID();
    await client.query(
      `INSERT INTO station_lead_transfers
         (id, ngo_id, source_station, target_station, filter_key, bsct_filter_key, donor_count, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8)`,
      [transferId, ngo.id, sources.join(', '), targets.join(', '), filter, crossNgo ? bsctFilter : 'all', rows.length, assignedBy],
    );

    const distribution = [];
    let cursor = 0;
    for (const bucket of buckets) {
      if (!froByStation.get(bucket.station) && bucket.fro) {
        const upd = await client.query(
          `UPDATE fro_station_assignments SET fro_worker_id=$1, updated_at=now()
            WHERE station=$2 AND ngo_id=$3`,
          [bucket.fro, bucket.station, ngo.id],
        );
        if (upd.rowCount === 0) {
          await client.query(
            `INSERT INTO fro_station_assignments (fro_worker_id, ngo_id, station, assigned_by)
             VALUES ($1,$2,$3,$4)`,
            [bucket.fro, ngo.id, bucket.station, assignedBy],
          );
        }
        froByStation.set(bucket.station, bucket.fro);
      }
      const slice = rows.slice(cursor, cursor + bucket.count);
      cursor += bucket.count;
      distribution.push({ station: bucket.station, count: slice.length, fro_worker_id: bucket.fro });
      for (const r of slice) {
        await client.query(
          `INSERT INTO station_lead_transfer_items
             (transfer_id, assignment_id, donor_id, source_station, target_station, source_fro_worker_id, original_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [transferId, r.assignment_id, r.donor_id, r.source_station, bucket.station, r.fro_worker_id, r.status],
        );
        await client.query(
          `UPDATE fro_assignments
              SET station=$1, fro_worker_id=$2, assigned_at=now(), assigned_by=$3
            WHERE id=$4 AND (status IS NULL OR status <> 'reassigned')`,
          [bucket.station, bucket.fro, assignedBy, r.assignment_id],
        );
      }
    }

    await client.query('COMMIT');
    bustStationCache();
    const touchedFroIds = new Set(rows.map(r => r.fro_worker_id).filter(Boolean));
    if (fallbackFro) touchedFroIds.add(fallbackFro);
    for (const fro of froByStation.values()) if (fro) touchedFroIds.add(fro);
    for (const id of touchedFroIds) invalidateFroCaches(id);
    return res.json({
      message: `Transferred ${rows.length} lead(s) from ${sources.join(', ')} to ${targets.join(', ')}`,
      transfer_id: transferId,
      moved: rows.length,
      skipped_at_target: bsctMatched.length - rows.length,
      source_stations: sources,
      target_stations: targets,
      distribution,
      filter,
      bsct_filter: crossNgo ? bsctFilter : 'all',
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ message: e.message });
  } finally {
    client.release();
  }
};

