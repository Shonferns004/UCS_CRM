import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const { data, error } = await supabase.from('workers').select('id, name, created_at, employment_status, is_active');
if (error) { console.error(error.message); process.exit(1); }
console.log('total workers:', data.length);
const byMonth = {};
for (const w of data) {
  const m = (w.created_at || '').slice(0, 7);
  byMonth[m] = (byMonth[m] || 0) + 1;
}
console.log('by created_at month:', byMonth);
console.log('\nAll workers (created_at, status):');
for (const w of data) {
  console.log(`${w.created_at.slice(0, 10)}  ${String(w.employment_status).padEnd(10)} ${w.is_active}  ${w.name}`);
}
