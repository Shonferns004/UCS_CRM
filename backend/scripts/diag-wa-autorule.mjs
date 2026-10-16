// READ-ONLY. Shows what the currently-enabled keyword automation rule actually
// sends, so the decision to disable it can be an informed one.

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

if (await exists('whatsapp_automation_rules')) {
  const { rows } = await q(
    `SELECT * FROM whatsapp_automation_rules ORDER BY priority, id`,
  );
  console.log('=== automation rules ===');
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log('whatsapp_automation_rules: table absent');
}

// What the AI service does with no configured row.
const { getSettings } = await import('../src/services/aiReplyService.js');
const s = await getSettings('bsct');
console.log('\n=== AI settings for bsct with no stored row ===');
console.log({ enabled: s.enabled, mode: s.mode, max_auto_replies: s.max_auto_replies });

// And the automation settings the webhook reads.
const { getSettings: getAutoSettings } = await import('../src/services/whatsappAutomationService.js');
console.log('\n=== automation settings the webhook reads ===');
console.log(await getAutoSettings());

process.exit(0);