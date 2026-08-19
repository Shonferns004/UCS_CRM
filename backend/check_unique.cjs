const {Pool} = require('pg');
const p = new Pool({connectionString:'postgres://ucs_app:xm4BAoZRhOVU3NFW2qLe@localhost:5434/postgres', ssl:{rejectUnauthorized:false}});
p.query(`SELECT conname FROM pg_constraint WHERE conrelid = 'ngos'::regclass AND contype = 'u'`).then(r => { console.table(r.rows); }).catch(e => console.error(e.message)).finally(() => p.end());