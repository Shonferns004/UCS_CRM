const {Pool} = require('pg');
const p = new Pool({connectionString:'postgres://ucs_app:xm4BAoZRhOVU3NFW2qLe@localhost:5434/postgres', ssl:{rejectUnauthorized:false}});
p.query(`
  SELECT ngo_id, COUNT(*) as ref_count FROM workers WHERE ngo_id IS NOT NULL GROUP BY ngo_id
  UNION ALL
  SELECT ngo_id, COUNT(*) FROM fro_assignments WHERE ngo_id IS NOT NULL GROUP BY ngo_id
  UNION ALL
  SELECT ngo_id, COUNT(*) FROM worker_ngo_allocations WHERE ngo_id IS NOT NULL GROUP BY ngo_id
  UNION ALL
  SELECT ngo_id, COUNT(*) FROM worker_people_allocations WHERE ngo_id IS NOT NULL GROUP BY ngo_id
  UNION ALL
  SELECT ngo_id, COUNT(*) FROM salary_allocations WHERE ngo_id IS NOT NULL GROUP BY ngo_id
  UNION ALL
  SELECT ngo_id, COUNT(*) FROM salary_payments WHERE ngo_id IS NOT NULL GROUP BY ngo_id
  UNION ALL
  SELECT ngo_id, COUNT(*) FROM users WHERE ngo_id IS NOT NULL GROUP BY ngo_id
  UNION ALL
  SELECT ngo_id, COUNT(*) FROM user_ngo_access WHERE ngo_id IS NOT NULL GROUP BY ngo_id
  UNION ALL
  SELECT ngo_id, COUNT(*) FROM ngo_allocation_settings WHERE ngo_id IS NOT NULL GROUP BY ngo_id
`).then(r => { console.table(r.rows); }).catch(e => console.error(e.message)).finally(() => p.end());