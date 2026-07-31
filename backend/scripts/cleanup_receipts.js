import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

async function run() {
  let total = 0;
  while (true) {
    const { data: ids } = await supabase
      .from('receipts')
      .select('id')
      .limit(1000);
    if (!ids || ids.length === 0) break;
    const batch = ids.map(r => r.id);
    const { error } = await supabase.from('receipts').delete().in('id', batch);
    if (error) throw error;
    total += batch.length;
    console.log(`Deleted ${total} receipts...`);
  }
  console.log(`Done. Deleted ${total} receipts total.`);
}

run().catch(err => { console.error(err); process.exit(1); });
