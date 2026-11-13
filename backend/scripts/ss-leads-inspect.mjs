// Read-only inspection for the SS (WhatsApp reply) leads flow.
// Usage: node scripts/ss-leads-inspect.mjs
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../.env') });

const pg = (await import('pg')).default;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false,
});
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

const DAYS = Number(process.argv[2] || 6);

try {
  console.log('\n=== NGOs ===');
  console.table(await q('select id, name from ngos order by name'));

  console.log(`\n=== WhatsApp Bulk Reply leads (last ${DAYS} days) ===`);
  console.table(await q(
    `select id, name, phone, status, recruiter_id, created_at,
            replace(left(coalesce(notes,''), 70), E'\n', ' | ') as note
       from leads
      where source = 'WhatsApp Bulk Reply'
        and created_at >= now() - ($1 || ' days')::interval
      order by created_at desc`,
    [DAYS],
  ));

  console.log('\n=== WhatsApp Bulk Reply leads by status (all time) ===');
  console.table(await q(
    `select status, count(*)::int as cnt, min(created_at) as first_at, max(created_at) as last_at
       from leads where source = 'WhatsApp Bulk Reply'
      group by status order by cnt desc`,
  ));

  console.log('\n=== Assignments on fake / WhatsApp stations ===');
  console.table(await q(
    `select station, count(*)::int as cnt
       from fro_assignments
      where station ilike '%whatsapp%'
      group by station order by cnt desc`,
  ));

  console.log('\n=== Stations per NGO ===');
  console.table(await q(
    `select n.name as ngo, s.station, w.name as fro, s.fro_worker_id
       from fro_station_assignments s
       join ngos n on n.id = s.ngo_id
       left join workers w on w.id = s.fro_worker_id
      order by n.name, s.station`,
  ));

  console.log('\n=== Donor profile matches for the recent reply numbers ===');
  console.table(await q(
    `with recent as (
       select distinct right(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), 10) as m10
         from leads
        where source = 'WhatsApp Bulk Reply'
          and created_at >= now() - ($1 || ' days')::interval
     )
     select r.m10,
            dp.id as donor_id,
            dp.name as donor_name,
            dp.ngo as donor_ngo,
            dp.station as donor_station,
            (select count(*)::int from fro_assignments a
              where a.donor_id = dp.id and (a.status is null or a.status <> 'reassigned')) as active_rows
       from recent r
       left join donor_profiles dp
         on right(regexp_replace(coalesce(dp.mobile_number,''), '[^0-9]', '', 'g'), 10) = r.m10
      order by r.m10`,
    [DAYS],
  ));
} catch (e) {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
