const {Pool} = require('pg');
const p = new Pool({connectionString:'postgres://ucs_app:xm4BAoZRhOVU3NFW2qLe@localhost:5434/postgres', ssl:{rejectUnauthorized:false}});
p.query(`
  SELECT conname, conrelid::regclass AS table_name, confrelid::regclass AS referenced_table
  FROM pg_constraint
  WHERE contype = 'f' AND confrelid = 'ngos'::regclass;
`).then(r => { console.table(r.rows); }).catch(e => console.error(e.message)).finally(() => p.end());