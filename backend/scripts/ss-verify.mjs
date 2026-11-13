import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../.env') });
const pg = (await import('pg')).default;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const q = async (sql, p = []) => (await pool.query(sql, p)).rows;

try {
  console.log('--- SS stations ---');
  console.table(await q(`
    select n.name ngo, s.station, w.name fro, s.fro_worker_id
      from fro_station_assignments s
      join ngos n on n.id = s.ngo_id
      left join workers w on w.id = s.fro_worker_id
     where s.station like 'SS-%'
     order by n.name
  `));

  console.log('--- leads inside SS stations ---');
  console.table(await q(`
    select n.name ngo, a.station, a.batch_type, a.is_new, a.status,
           count(*)::int cnt
      from fro_assignments a join ngos n on n.id = a.ngo_id
     where a.station like 'SS-%'
     group by 1,2,3,4,5
     order by 1
  `));

  console.log('--- the added leads ---');
  console.table(await q(`
    select dp.id donor_id, dp.name, dp.mobile_number, dp.ngo, a.station,
           a.notes, a.assigned_at
      from fro_assignments a join donor_profiles dp on dp.id = a.donor_id
     where a.station like 'SS-%'
     order by a.station, a.assigned_at
  `));

  console.log('--- merged replies (regular stations) ---');
  console.table(await q(`
    select dp.id donor_id, dp.name, a.station, left(a.notes, 80) notes
      from fro_assignments a join donor_profiles dp on dp.id = a.donor_id
     where a.notes like '%[Lead:%'
       and a.station not like 'SS-%'
     order by a.station
  `));

  console.log('--- WA reply lead statuses ---');
  console.table(await q(`
    select status, count(*)::int cnt
      from leads where source='WhatsApp Bulk Reply'
     group by status order by cnt desc
  `));
} catch (e) { console.error('ERR', e.message); } finally { await pool.end(); }
