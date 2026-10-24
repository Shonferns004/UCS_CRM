import db from '../src/config/db.js';
const { rows } = await db._pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='workers'");
console.log('workers cols:', rows.map(r=>r.column_name));
const { rows: u } = await db._pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='users'");
console.log('users cols:', u.map(r=>r.column_name));
process.exit(0);