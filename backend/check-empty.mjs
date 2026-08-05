import {Pool} from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  const { rows: tables } = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name;
  `);

  const empty = [];
  for (const t of tables) {
    const { rows: c } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM public."${t.table_name}"`
    );
    if (c[0].cnt === 0) empty.push(t.table_name);
  }

  console.log(`Empty tables (${empty.length}):`);
  for (const name of empty) console.log(`  - ${name}`);
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await pool.end();
}
