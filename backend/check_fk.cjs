const {Pool} = require('pg');
const p = new Pool({connectionString:'postgres://ucs_app:xm4BAoZRhOVU3NFW2qLe@localhost:5434/postgres', ssl:{rejectUnauthorized:false}});
p.query(`
  SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'ngos';
`).then(r => { console.table(r.rows); }).catch(e => console.error(e.message)).finally(() => p.end());