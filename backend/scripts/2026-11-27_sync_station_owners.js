/**
 * One-off station ownership sync (2026-11-27).
 *
 * 1. Stations WITH an assigned FRO: every live lead's fro_worker_id is set to
 *    that station's FRO (status / disposition / logs / receipts untouched).
 * 2. Stations WITHOUT an assigned FRO (including no station row and null
 *    station): live leads are detached (fro_worker_id = NULL).
 * 3. fro_station_assignments.crm_agent_id is cleared (CRM-agent layer retired
 *    from station ownership; the crm_agents login table itself is kept).
 *
 * Every ownership change is written to fro_ownership_changes first, so the
 * operation can be audited or rolled back per assignment id.
 *
 * Run from backend/: node scripts/2026-11-27_sync_station_owners.js
 */
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

const CHANGED_BY = 'system:station_owner_sync_2026-11-27';
const BATCH = 20000;

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  connectionTimeoutMillis: 20000,
});

const LIVE = `(a.status IS NULL OR a.status <> 'reassigned')`;

async function ensureAuditTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS fro_ownership_changes (
      id bigserial PRIMARY KEY,
      assignment_id integer NOT NULL,
      donor_id integer,
      ngo_id uuid,
      station text,
      old_fro_worker_id uuid,
      new_fro_worker_id uuid,
      change_type text NOT NULL,
      changed_by text,
      changed_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_fro_ownership_changes_assignment
      ON fro_ownership_changes (assignment_id)
  `);
}

async function syncAssignedStations(client) {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TEMP TABLE _sync ON COMMIT DROP AS
      SELECT a.id AS assignment_id,
             a.donor_id,
             a.ngo_id,
             a.station,
             a.fro_worker_id AS old_fro_worker_id,
             f.fro_worker_id AS new_fro_worker_id
        FROM fro_assignments a
        JOIN fro_station_assignments f
          ON f.ngo_id = a.ngo_id
         AND btrim(f.station) = btrim(a.station)
         AND f.fro_worker_id IS NOT NULL
       WHERE ${LIVE}
         AND a.fro_worker_id IS DISTINCT FROM f.fro_worker_id
    `);
    const audit = await client.query(`
      INSERT INTO fro_ownership_changes
        (assignment_id, donor_id, ngo_id, station, old_fro_worker_id, new_fro_worker_id, change_type, changed_by)
      SELECT assignment_id, donor_id, ngo_id, station, old_fro_worker_id, new_fro_worker_id, 'station_sync', $1
        FROM _sync
    `, [CHANGED_BY]);
    const upd = await client.query(`
      UPDATE fro_assignments a
         SET fro_worker_id = s.new_fro_worker_id
        FROM _sync s
       WHERE a.id = s.assignment_id
    `);
    await client.query('COMMIT');
    return { audited: audit.rowCount || 0, updated: upd.rowCount || 0 };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  }
}

async function detachUnassignedStations(client) {
  let total = 0;
  let batches = 0;
  for (;;) {
    const res = await client.query(`
      WITH batch AS (
        SELECT a.id, a.donor_id, a.ngo_id, a.station, a.fro_worker_id
          FROM fro_assignments a
         WHERE ${LIVE}
           AND a.fro_worker_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM fro_station_assignments f
              WHERE f.ngo_id = a.ngo_id
                AND btrim(f.station) = btrim(a.station)
                AND f.fro_worker_id IS NOT NULL
           )
         ORDER BY a.id
         LIMIT ${BATCH}
      ),
      audit AS (
        INSERT INTO fro_ownership_changes
          (assignment_id, donor_id, ngo_id, station, old_fro_worker_id, new_fro_worker_id, change_type, changed_by)
        SELECT id, donor_id, ngo_id, station, fro_worker_id, NULL, 'unassigned_null', $1
          FROM batch
      )
      UPDATE fro_assignments a
         SET fro_worker_id = NULL
        FROM batch b
       WHERE a.id = b.id
      RETURNING a.id
    `, [CHANGED_BY]);
    const n = res.rowCount || 0;
    if (n === 0) break;
    total += n;
    batches += 1;
    process.stdout.write(`  detached ${total.toLocaleString('en-IN')}\r`);
  }
  process.stdout.write('\n');
  return { detached: total, batches };
}

async function clearCrmAgents(client) {
  const res = await client.query(`
    UPDATE fro_station_assignments
       SET crm_agent_id = NULL,
           updated_at = now()
     WHERE crm_agent_id IS NOT NULL
  `);
  return res.rowCount || 0;
}

async function summary(client) {
  const q = async (sql) => (await client.query(sql)).rows[0];
  return {
    assigned_mismatch: (await q(`
      WITH st AS (
        SELECT f.ngo_id, btrim(f.station) station, f.fro_worker_id station_fro
          FROM fro_station_assignments f WHERE f.fro_worker_id IS NOT NULL
      )
      SELECT count(*)::int c
        FROM st
        JOIN fro_assignments a
          ON a.ngo_id = st.ngo_id
         AND btrim(a.station) = st.station
         AND (a.status IS NULL OR a.status <> 'reassigned')
       WHERE a.fro_worker_id IS DISTINCT FROM st.station_fro
    `)).c,
    unassigned_with_owner: (await q(`
      SELECT count(*)::int c
        FROM fro_assignments a
       WHERE (a.status IS NULL OR a.status <> 'reassigned')
         AND a.fro_worker_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM fro_station_assignments f
            WHERE f.ngo_id = a.ngo_id
              AND btrim(f.station) = btrim(a.station)
              AND f.fro_worker_id IS NOT NULL
         )
    `)).c,
    crm_agents_left: (await q(`SELECT count(*)::int c FROM fro_station_assignments WHERE crm_agent_id IS NOT NULL`)).c,
    audit_rows: (await q(`SELECT count(*)::int c FROM fro_ownership_changes`)).c,
  };
}

(async () => {
  const client = await pool.connect();
  try {
    console.log('Ensuring audit table…');
    await ensureAuditTable(client);

    console.log('1) Syncing leads of stations that have an assigned FRO…');
    const sync = await syncAssignedStations(client);
    console.log(`   audited ${sync.audited.toLocaleString('en-IN')}, updated ${sync.updated.toLocaleString('en-IN')}`);

    console.log('2) Detaching leads of stations without an FRO…');
    const detach = await detachUnassignedStations(client);
    console.log(`   detached ${detach.detached.toLocaleString('en-IN')} in ${detach.batches} batch(es)`);

    console.log('3) Clearing station crm_agent_id…');
    const crm = await clearCrmAgents(client);
    console.log(`   cleared ${crm.toLocaleString('en-IN')} station row(s)`);

    console.log('Summary:', await summary(client));
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error('\nFAILED:', e.message);
  process.exit(1);
});
