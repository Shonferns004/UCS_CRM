import {Pool} from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  const { rows: tables } = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);

  console.log(`Total tables: ${tables.length}\n`);

  for (const t of tables) {
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM public."${t.table_name}"`
    );
    const cnt = countRows[0].cnt;
    console.log(`${t.table_name.padEnd(40)} ${String(cnt).padStart(8)} rows`);
  }
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await pool.end();
}
