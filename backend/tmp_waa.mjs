import db from './src/config/db.js';
try {
  const r = await db._pool.query("SELECT * FROM worker_agent_assignments LIMIT 20");
  console.log(JSON.stringify(r.rows, null, 2));
} catch (e) { console.error(e.message); }
finally { process.exit(0); }
