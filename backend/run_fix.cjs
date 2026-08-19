const {Pool} = require('pg');
const fs = require('fs');
const p = new Pool({connectionString:'postgres://ucs_app:xm4BAoZRhOVU3NFW2qLe@localhost:5434/postgres', ssl:{rejectUnauthorized:false}});

const sql = fs.readFileSync('fix_ngo_duplicates.sql', 'utf8');
p.query(sql).then(r => { 
  console.log('Success!'); 
  if (r.rows) console.table(r.rows); 
}).catch(e => console.error('Error:', e.message)).finally(() => p.end());