import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  host: 'ucs-database-1.cdy1iwm0g420.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'ucs_crm',
  user: 'ucsadmin',
  password: process.env.DB_PASSWORD || 'TARS2024!ucs'
});

async function main() {
  const projects = ['bsct', 'mann', 'aflf'];
  for (const p of projects) {
    await pool.query('SELECT cancel_receipt_no($1)', [p]);
    console.log('Reset counter for', p);
  }

  const { rows: maxes } = await pool.query(`
    SELECT project_id,
           COALESCE(MAX(CASE WHEN receipt_no ~ '^[0-9]+$' THEN receipt_no::bigint END), 0) AS max_no
    FROM receipts
    GROUP BY project_id
    ORDER BY project_id
  `);
  console.log('\nMax receipt_no in receipts table:', JSON.stringify(maxes, null, 2));

  const { rows: counters } = await pool.query(`
    SELECT project_id, last_no FROM receipt_no_counters
    WHERE project_id IN ('bsct','mann','aflf')
    ORDER BY project_id
  `);
  console.log('Counters after reset:', JSON.stringify(counters, null, 2));

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
