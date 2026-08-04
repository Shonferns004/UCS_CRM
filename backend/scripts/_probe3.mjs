import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const { data, error } = await supabase.from('leads').select('name, status, created_at').eq('status', 'joined').order('created_at', { ascending: false }).limit(50);
if (error) { console.error(error.message); process.exit(1); }
console.log('joined leads:', data.length);
for (const l of data) console.log(l.created_at.slice(0,10), l.name);
