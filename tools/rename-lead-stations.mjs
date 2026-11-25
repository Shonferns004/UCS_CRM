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

const FORWARD = {
  'SS-BSCT': 'B-WhatsApp-Leads',
  'SS-AFLF': 'A-WhatsApp-Leads',
  'SS-MANN': 'M-WhatsApp-Leads',
};
const REVERSE = Object.fromEntries(Object.entries(FORWARD).map(([k, v]) => [v, k]));

const mode = (process.argv[2] || 'dry').toLowerCase();
const map = mode === 'rollback' ? REVERSE : FORWARD;
const fromValues = Object.keys(map);
const toValues = Object.values(map);

const { rows: columns } = await pool.query(`
  select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
   where c.table_schema = 'public'
     and t.table_type = 'BASE TABLE'
     and c.column_name ilike '%station%'
     and c.data_type in ('text', 'character varying')
   order by c.table_name, c.column_name
`);

console.log(`mode=${mode}  columns=${columns.length}`);

const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;
let grandTotal = 0;
const plan = [];

for (const { table_name: table, column_name: column } of columns) {
  const { rows } = await pool.query(
    `select ${quote(column)} as value, count(*)::int as c
       from ${quote(table)}
      where ${quote(column)} = any($1::text[])
      group by 1 order by 2 desc`,
    [fromValues],
  );
  if (!rows.length) continue;
  const total = rows.reduce((sum, r) => sum + r.c, 0);
  grandTotal += total;
  plan.push({ table, column, total, breakdown: rows });
  console.log(`  ${table}.${column}: ${total} row(s) -> ${rows.map((r) => `${r.value}(${r.c})`).join(', ')}`);
}

console.log(`TOTAL rows to change: ${grandTotal}`);

// A rename must not collide with a station that already exists for the same
// NGO: (ngo_id, station) is unique, so an existing target row would abort the
// transaction halfway through the plan.
let collisions = 0;
for (const { table, column } of plan) {
  const { rows } = await pool.query(
    `select count(*)::int as c from ${quote(table)} where ${quote(column)} = any($1::text[])`,
    [toValues],
  );
  const count = rows[0]?.c || 0;
  if (count) {
    collisions += count;
    console.log(`  COLLISION ${table}.${column}: ${count} row(s) already use a target name`);
  }
}
if (collisions && mode !== 'rollback') {
  console.log('Aborting: resolve the collisions above first (or rename those rows by hand).');
  await pool.end();
  process.exit(1);
}

if (mode === 'dry') {
  console.log('DRY RUN — nothing written. Use "apply" to migrate, "rollback" to reverse.');
  await pool.end();
  process.exit(0);
}

if (!plan.length) {
  console.log('Nothing to do.');
  await pool.end();
  process.exit(0);
}

try {
  await pool.query('begin');
  for (const { table, column } of plan) {
    for (let i = 0; i < fromValues.length; i += 1) {
      const from = fromValues[i];
      const to = toValues[i];
      const { rowCount } = await pool.query(
        `update ${quote(table)} set ${quote(column)} = $1 where ${quote(column)} = $2`,
        [to, from],
      );
      if (rowCount) console.log(`  ${table}.${column}: ${from} -> ${to} (${rowCount})`);
    }
  }
  await pool.query('commit');
  console.log(`DONE (${mode}). ${grandTotal} row(s) updated.`);
} catch (error) {
  await pool.query('rollback');
  console.error('ROLLED BACK:', error.message);
  process.exitCode = 1;
}

await pool.end();
