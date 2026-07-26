import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function exportFroAgents() {
  const { data: workers, error } = await supabase
    .from('workers')
    .select('name, email')
    .ilike('department', 'fro')
    .eq('employment_status', 'active');

  if (error) {
    console.error('Error fetching FRO workers:', error);
    process.exit(1);
  }

  if (!workers || workers.length === 0) {
    console.log('No FRO workers found.');
    process.exit(0);
  }

  const rows = workers.map((w, i) => ({
    'Name': w.name || `FRO Agent ${i + 1}`,
    'Email': w.email || '',
    'Password': 'sevak@123',
    'Role': 'agent',
  }));

  const validRows = rows.filter(r => r.Email);

  const ws = XLSX.utils.json_to_sheet(validRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Agents');

  const outPath = 'FRO_Agents_Bulk_Upload.xlsx';
  XLSX.writeFile(wb, outPath);
  console.log(`Exported ${validRows.length} FRO agents to ${outPath}`);
}

exportFroAgents();
