import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const { data, error } = await supabase.from('workers').select('name, created_at, correspondence').in('name', ['Riya Pal','Mamta Shah','Sohan Khedekar','Muskan Khan','Varsha G. Tambe']);
if (error) { console.error(error.message); process.exit(1); }
for (const w of data) {
  console.log('---', w.name, w.created_at.slice(0,10));
  console.log(JSON.stringify(w.correspondence));
}
