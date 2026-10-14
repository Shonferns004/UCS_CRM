// READ-ONLY. Has the enabled automation ever fired? And does its send path
// record what it sent, or is it invisible in the inbox and the messages table?

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
const exists = async (t) => {
  const { rows } = await q(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [t],
  );
  return rows.length > 0;
};

for (const t of ['whatsapp_automation_logs', 'whatsapp_automation_rule_state']) {
  console.log(`=== ${t} ===`);
  if (!(await exists(t))) { console.log('absent'); continue; }
  const { rows } = await q(`SELECT * FROM ${t} ORDER BY 1 DESC LIMIT 10`);
  console.log(rows.length ? rows : 'no rows');
}

// Does the automation's send record a `messages` row at all?
console.log('\n=== any automated messages ever ===');
const { rows: am } = await q(
  `SELECT count(*)::int AS n FROM messages WHERE is_automated = true`,
);
console.log(am[0]);

// What the sendViaMeta path in the service actually persists: read the source.
const src = await import('fs').then(fs => fs.promises.readFile(
  new URL('../src/services/whatsappAutomationService.js', import.meta.url), 'utf8'));
const after = src.indexOf('async function sendViaMeta');
console.log('\n=== sendViaMeta + recordMessage ===');
console.log(src.slice(after, after + 2600));

process.exit(0);