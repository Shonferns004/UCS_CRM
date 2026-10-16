// READ-ONLY. Compares the columns the automation service QUERIES against the
// columns the live table actually HAS.
//
// A mismatch here means the service filters on a column that does not exist,
// Postgres throws, and the webhook's catch logs it and carries on -- so the
// automation looks enabled in the admin UI while doing nothing at all.

import { config as dotenv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });
if (process.env.DATABASE_URL) {
  const u = new URL(process.env.DATABASE_URL);
  u.hostname = '127.0.0.1';
  u.port = process.env.DB_TUNNEL_LOCAL_PORT || '15432';
  process.env.DATABASE_URL = u.toString();
}

const db = (await import('../src/config/db.js')).default;
const q = (sql, p) => db._pool.query(sql, p);

for (const t of ['whatsapp_automation_rules', 'whatsapp_automation_settings', 'whatsapp_ai_settings']) {
  const { rows } = await q(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [t],
  );
  console.log(`\n=== ${t} ===`);
  console.log(rows.length ? rows.map(r => `${r.column_name} (${r.data_type})`).join('\n') : 'TABLE ABSENT');
}

// Reproduce the exact query the service runs.
console.log('\n=== replay of listEnabledRules() ===');
try {
  const { data, error } = await db
    .from('whatsapp_automation_rules')
    .select('*')
    .eq('project', 'bsct2')
    .eq('enabled', true)
    .order('priority', { ascending: true });
  console.log('with .eq("enabled", true):', { rows: data?.length, error: error?.message || null });
} catch (e) { console.log('threw:', e.message); }

try {
  const { data, error } = await db
    .from('whatsapp_automation_rules')
    .select('*')
    .eq('project', 'bsct2')
    .eq('is_active', true)
    .order('priority', { ascending: true });
  console.log('with .eq("is_active", true):', { rows: data?.length, error: error?.message || null });
} catch (e) { console.log('threw:', e.message); }

process.exit(0);