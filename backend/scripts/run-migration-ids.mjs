import { Pool } from 'pg';
import fs from 'fs';
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:bsct_2014@192.168.1.152:5432/ucs_crm', ssl: false });
const sql = fs.readFileSync('migrations/20261024_grant_allowed_ids.sql', 'utf8');
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('migration applied');
} catch (e) {
  await client.query('ROLLBACK');
  console.error('migration failed:', e.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
