import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const res = await pool.query(`SELECT id, name, photo_url, signature_url FROM workers WHERE photo_url IS NOT NULL OR signature_url IS NOT NULL LIMIT 15`);
for (const r of res.rows) {
  console.log(`${r.name}:`);
  console.log(`  photo: ${r.photo_url || '(null)'}`);
  console.log(`  sig:   ${r.signature_url || '(null)'}`);
}
const count = await pool.query(`SELECT COUNT(*) FROM workers WHERE photo_url IS NOT NULL`);
console.log('Total workers with photo_url:', count.rows[0].count);
await pool.end();
