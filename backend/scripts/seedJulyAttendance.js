import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const JOIN_MONTH = '2026-06';
const ATT_MONTH_START = '2026-07-01';
const ATT_MONTH_END = '2026-07-31';
const PUNCH_IN_IST = { h: 9, m: 30 };
const PUNCH_OUT_IST = { h: 18, m: 30 };
const DRY_RUN = !process.argv.includes('--run');

function istTimestamp(dateStr, { h, m }) {
  return new Date(Date.UTC(
    parseInt(dateStr.slice(0, 4), 10),
    parseInt(dateStr.slice(5, 7), 10) - 1,
    parseInt(dateStr.slice(8, 10), 10),
    h - 5,
    m - 30,
  )).toISOString();
}

function workingDays() {
  const days = [];
  const start = new Date(`${ATT_MONTH_START}T00:00:00Z`);
  const end = new Date(`${ATT_MONTH_END}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === 0) continue;
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    days.push(`${y}-${mo}-${day}`);
  }
  return days;
}

async function main() {
  const rl = readline.createInterface({ input, output });

  const { data: workers, error: wErr } = await supabase
    .from('workers')
    .select('id, name, created_at')
    .eq('employment_status', 'active')
    .order('created_at', { ascending: true });

  if (wErr) {
    console.error('Failed to fetch workers:', wErr.message);
    process.exit(1);
  }

  if (!workers || workers.length === 0) {
    console.log('No active workers.');
    process.exit(0);
  }

  const workerIds = workers.map(w => w.id);
  const { data: existingAtt, error: aErr } = await supabase
    .from('attendance')
    .select('worker_id, date')
    .gte('date', ATT_MONTH_START)
    .lte('date', ATT_MONTH_END)
    .in('worker_id', workerIds);

  if (aErr) {
    console.error('Failed to fetch existing attendance:', aErr.message);
    process.exit(1);
  }

  const existingKeys = new Set((existingAtt || []).map(r => `${r.worker_id}|${r.date}`));
  const withAtt = new Set((existingAtt || []).map(r => r.worker_id));

  console.log(`Active workers: ${workers.length}`);
  console.log('\nSelect workers from the list (marked [*] if they already have some July attendance):');
  workers.forEach((w, i) => {
    const joined = (w.created_at || '').split('T')[0];
    const mark = withAtt.has(w.id) ? '*' : ' ';
    console.log(`  [${i + 1}] ${mark} ${w.name}  (joined ${joined})`);
  });

  const flagIdx = process.argv.indexOf('--workers');
  let answer = flagIdx >= 0 ? process.argv[flagIdx + 1] : null;
  if (answer == null && process.stdin.isTTY) {
    answer = await rl.question('\nSelect workers to seed (comma-separated numbers, e.g. 1,3,5 or "all"): ');
  }
  rl.close();
  if (answer == null) {
    console.error('Pass --workers <indices|all> or run interactively (TTY).');
    process.exit(1);
  }
  const selection = new Set();
  if (answer.trim().toLowerCase() === 'all') {
    workers.forEach((_, i) => selection.add(i));
  } else {
    for (const part of answer.split(',')) {
      const n = parseInt(part.trim(), 10);
      if (Number.isInteger(n) && n >= 1 && n <= workers.length) selection.add(n - 1);
    }
  }

  const selected = workers.filter((_, i) => selection.has(i));
  if (selected.length === 0) {
    console.log('No valid selection. Exiting.');
    process.exit(0);
  }

  const days = workingDays();
  const records = [];
  let skippedDates = 0;
  for (const w of selected) {
    for (const date of days) {
      if (existingKeys.has(`${w.id}|${date}`)) {
        skippedDates++;
        continue;
      }
      records.push({
        worker_id: w.id,
        date,
        punch_in_time: istTimestamp(date, PUNCH_IN_IST),
        punch_out_time: istTimestamp(date, PUNCH_OUT_IST),
        late_minutes: 0,
        status: 'present',
        hours_worked: '9h 0m',
        punch_method: 'manual',
      });
    }
  }

  console.log(`\nSelected: ${selected.map(w => w.name).join(', ')}`);
  console.log(`Plan: ${records.length} attendance records for ${selected.length} workers across ${days.length} working days (Jul 1-31, Mon-Sat, no Sundays).${skippedDates ? ` (${skippedDates} already-existing dates skipped)` : ''}`);

  if (DRY_RUN) {
    console.log('\nDry-run complete. Re-run with --run to insert records.');
    process.exit(0);
  }

  let inserted = 0;
  let failed = 0;
  for (let i = 0; i < records.length; i += 500) {
    const batch = records.slice(i, i + 500);
    const { error } = await supabase.from('attendance').insert(batch);
    if (error) {
      console.error(`Batch insert failed (${batch.length} records): ${error.message}`);
      failed += batch.length;
      continue;
    }
    inserted += batch.length;
  }

  console.log(`\nDone: ${inserted} inserted, ${failed} failed.`);
  process.exit(0);
}

main();
