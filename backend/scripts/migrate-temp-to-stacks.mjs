import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:bsct_2014@192.168.1.152:5432/ucs_crm', ssl: false });

const targets = [
  { fro: '8ff3fe20-7ae8-4e97-a940-a70905ab893f', name: 'Stack 1', target: 'BOD-1', count: 70, offset: 0 },
  { fro: 'add44d51-b16a-4c68-9ec4-187fde6d247f', name: 'Stack 2', target: 'BOD-3', count: 70, offset: 70 },
  { fro: '21929637-0ccd-4513-82f2-fb79c4d5d058', name: 'Stack 3', target: 'BFD-13', count: 70, offset: 140 },
  { fro: '13dcafb8-5851-428c-8c4b-24295456db30', name: 'Stack 4', target: 'BOD-13', count: 69, offset: 210 },
  { fro: '03adaed2-1af1-45ad-b117-b0dcd5586c29', name: 'Stack 5', target: 'BOD-14', count: 69, offset: 279 },
  { fro: '549a73da-844f-405b-b999-c901f76acc5b', name: 'Stack 6', target: 'BFD-11', count: 70, offset: 348 },
  { fro: 'fe362039-8138-469a-90f9-4c1024516673', name: 'Stack 7', target: 'BOD-12', count: 69, offset: 418 },
  { fro: '958eb5a1-22d2-4c59-9003-f40368af8b5f', name: 'Stack 8', target: 'BFD-8', count: 70, offset: 487 },
  { fro: '6158d741-e26d-4a6e-9645-62f8405f564e', name: 'Stack 9', target: 'BOD-4', count: 70, offset: 557 },
];

const client = await pool.connect();
try {
  await client.query('BEGIN');
  // fetch all high-tier rows on BOD-2 ordered by id
  const { rows: allRows } = await client.query(
    "SELECT id, donor_id FROM fro_assignments WHERE station='BOD-2' AND batch_type='high_tier' AND (status IS NULL OR status <> 'reassigned') ORDER BY id"
  );
  console.log('total high-tier rows:', allRows.length);

  for (const t of targets) {
    const sliceIds = allRows.slice(t.offset, t.offset + t.count).map(r => r.id);
    const sliceDonorIds = allRows.slice(t.offset, t.offset + t.count).map(r => r.donor_id);
    if (sliceIds.length === 0) { console.log(t.name, 'no rows'); continue; }

    // create stack
    const { rows: st } = await client.query(
      `INSERT INTO donor_stacks (ngo_id, station, name, stack_type, fro_worker_id)
       VALUES ($1,$2,$3,'high_tier',$4) RETURNING id`,
      ['598954e3-6716-4e83-adc8-323d622facf0', 'BOD-2', t.name, t.fro],
    );
    const stackId = st[0].id;

    // populate members
    await client.query(
      `INSERT INTO donor_stack_members (stack_id, donor_id, assignment_id)
       SELECT $1, donor_id, id FROM fro_assignments
        WHERE id = ANY($2::int[])
       ON CONFLICT (stack_id, donor_id) DO NOTHING`,
      [stackId, sliceIds],
    );
    console.log(`${t.name}: stack ${stackId}, ${sliceIds.length} members`);
  }

  await client.query('COMMIT');
  console.log('migration complete');

  // verify
  const { rows: v } = await pool.query("SELECT count(*)::int c FROM donor_stack_members");
  console.log('total stack members:', v[0].c);
  const { rows: v2 } = await pool.query("SELECT count(*)::int c FROM donor_stacks");
  console.log('total stacks:', v2[0].c);
} catch (e) {
  await client.query('ROLLBACK');
  console.error('migration failed:', e.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
