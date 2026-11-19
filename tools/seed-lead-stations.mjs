// Creates the source-specific lead stations that the Leads Hub routes to.
//
// Idempotent: only inserts a row when (ngo_id, station) is missing, so running
// it again is a no-op and it never touches an owner that was assigned by hand.
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const backend = 'C:/Users/Sohan Khedekar/my projects/UCS_CRM/backend';
const dotenv = require(path.join(backend, 'node_modules/dotenv'));
dotenv.config({ path: path.join(backend, '.env') });
const { Pool } = require(path.join(backend, 'node_modules/pg'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

const STATIONS = {
  BSCT: ['B-WhatsApp-Leads', 'B-Meta-Leads', 'B-Email-Leads', 'B-Google-Leads'],
  AFLF: ['A-WhatsApp-Leads', 'A-Meta-Leads', 'A-Email-Leads', 'A-Google-Leads'],
  MANN: ['M-WhatsApp-Leads', 'M-Meta-Leads', 'M-Email-Leads', 'M-Google-Leads'],
};

const apply = String(process.argv[2] || '').toLowerCase() === 'apply';

const { rows: ngos } = await pool.query(`select id, name from ngos where upper(name) = any($1::text[])`, [Object.keys(STATIONS)]);
const idByName = new Map(ngos.map((n) => [String(n.name).toUpperCase(), n.id]));
console.log(`mode=${apply ? 'apply' : 'dry'}  ngos found: ${ngos.map((n) => n.name).join(', ') || '(none)'}`);

let created = 0;
let existing = 0;
for (const [ngo, stations] of Object.entries(STATIONS)) {
  const ngoId = idByName.get(ngo);
  if (!ngoId) {
    console.log(`  SKIP ${ngo}: row not found in ngos`);
    continue;
  }
  for (const station of stations) {
    const { rows } = await pool.query(
      `select id, fro_worker_id from fro_station_assignments where ngo_id = $1 and station = $2 limit 1`,
      [ngoId, station],
    );
    if (rows.length) {
      existing += 1;
      console.log(`  = ${station.padEnd(20)} (${ngo})  exists, owner=${rows[0].fro_worker_id ? 'set' : 'none'}`);
      continue;
    }
    if (!apply) {
      created += 1;
      console.log(`  + ${station.padEnd(20)} (${ngo})  would create`);
      continue;
    }
    await pool.query(`insert into fro_station_assignments (ngo_id, station) values ($1, $2)`, [ngoId, station]);
    created += 1;
    console.log(`  + ${station.padEnd(20)} (${ngo})  created`);
  }
}

console.log(`${apply ? 'CREATED' : 'WOULD CREATE'}: ${created}   existing: ${existing}`);
await pool.end();
