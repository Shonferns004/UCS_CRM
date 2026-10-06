// D3: one-time synchronisation of the donor's current FRO with the agent
// currently assigned to that donor's (NGO, station).
//
//   NGO + Station -> Agent   ==>   fro_assignments.fro_worker_id = Agent
//
// original_fro_worker_id is backfilled BEFORE the sync so the pre-migration
// FRO survives as history and can never override the station agent.
//
// Deliberate non-actions:
//   * donor with station IS NULL          -> untouched
//   * station has no row                  -> untouched (reported)
//   * station row exists but has no agent -> untouched (we never clear an FRO
//     that the admin has not explicitly replaced)
//   * rows already equal to their agent   -> untouched
import pg from 'pg';

const DSN =
  process.env.DATABASE_URL ||
  'postgres://ucs_admin:ucscompany123@ucs-crm-db.cv8asue2a57e.ap-south-1.rds.amazonaws.com:5432/postgres';

const APPLY = process.argv.includes('--apply');

async function main() {
  const client = new pg.Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // 1) backfill original_fro_worker_id BEFORE we start overwriting
  const backfill = await client.query(`
    UPDATE fro_assignments
       SET original_fro_worker_id = fro_worker_id
     WHERE original_fro_worker_id IS NULL
       AND fro_worker_id IS NOT NULL`);
  console.log(`original_fro_worker_id backfilled: ${backfill.rowCount}`);

  // 2) classify every active assignment row
  const cls = await client.query(`
    SELECT
      count(*) FILTER (WHERE a.fro_worker_id IS NULL)                              AS null_station,
      count(*) FILTER (WHERE a.station IS NOT NULL
                        AND s.id IS NULL)                                          AS no_station_row,
      count(*) FILTER (WHERE s.id IS NOT NULL AND s.fro_worker_id IS NULL)         AS station_has_no_agent,
      count(*) FILTER (WHERE s.id IS NOT NULL
                        AND s.fro_worker_id IS NOT NULL
                        AND a.fro_worker_id IS DISTINCT FROM s.fro_worker_id)      AS needs_sync,
      count(*) FILTER (WHERE s.id IS NOT NULL
                        AND s.fro_worker_id IS NOT NULL
                        AND a.fro_worker_id = s.fro_worker_id)                     AS already_synced
    FROM fro_assignments a
    LEFT JOIN fro_station_assignments s
      ON s.ngo_id = a.ngo_id AND s.station = a.station
    WHERE a.status <> 'reassigned'`);
  console.log('classification:', JSON.stringify(cls.rows[0]));

  // 3) show a sample of what would change
  const sample = await client.query(`
    SELECT a.id, a.donor_id, n.name AS ngo, a.station,
           w_old.name AS current_fro, w_new.name AS station_agent
    FROM fro_assignments a
    JOIN ngos n ON n.id = a.ngo_id
    JOIN fro_station_assignments s
      ON s.ngo_id = a.ngo_id AND s.station = a.station
    LEFT JOIN workers w_old ON w_old.id = a.fro_worker_id
    LEFT JOIN workers w_new ON w_new.id = s.fro_worker_id
    WHERE a.status <> 'reassigned'
      AND s.fro_worker_id IS NOT NULL
      AND a.fro_worker_id IS DISTINCT FROM s.fro_worker_id
    LIMIT 8`);
  console.log('sample changes:');
  for (const r of sample.rows) console.log('  ', JSON.stringify(r));

  if (!APPLY) {
    console.log('\nDRY RUN — pass --apply to execute.');
    await client.end();
    return;
  }

  // 4) apply: current FRO := station agent
  const upd = await client.query(`
    UPDATE fro_assignments a
       SET fro_worker_id = s.fro_worker_id
    FROM fro_station_assignments s
    WHERE s.ngo_id = a.ngo_id
      AND s.station = a.station
      AND s.fro_worker_id IS NOT NULL
      AND a.status <> 'reassigned'
      AND a.fro_worker_id IS DISTINCT FROM s.fro_worker_id`);
  console.log(`APPLIED write-through rows: ${upd.rowCount}`);

  // 5) verify: every active row with a station that has an agent must match
  const bad = await client.query(`
    SELECT count(*)::int AS mismatch
    FROM fro_assignments a
    JOIN fro_station_assignments s
      ON s.ngo_id = a.ngo_id AND s.station = a.station
    WHERE a.status <> 'reassigned'
      AND s.fro_worker_id IS NOT NULL
      AND a.fro_worker_id IS DISTINCT FROM s.fro_worker_id`);
  console.log('VERIFY mismatches remaining:', bad.rows[0].mismatch);
  if (bad.rows[0].mismatch !== 0) throw new Error('write-through verification failed');

  const orig = await client.query(`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE original_fro_worker_id IS NOT NULL) AS with_original
    FROM fro_assignments WHERE status <> 'reassigned'`);
  console.log('VERIFY original_fro_worker_id:', JSON.stringify(orig.rows[0]));

  await client.end();
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
