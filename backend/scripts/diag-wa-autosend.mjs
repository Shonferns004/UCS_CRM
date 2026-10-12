// READ-ONLY. Reports every mechanism that can send a WhatsApp message WITHOUT a
// human pressing send, and whether it is currently armed.
//
// Nothing is enabled or disabled here. This is the inventory behind the answer to
// "which messages/PDFs were appearing without anybody asking", and the safety
// check for requirement 8.

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

// ── 1. Keyword automations ────────────────────────────────────────────────
console.log('=== 1. keyword automations (runAutomationForInbound) ===');
if (await exists('whatsapp_automation_settings')) {
  const { rows } = await q(`SELECT id, enabled, updated_by, updated_at FROM whatsapp_automation_settings`);
  console.log(rows.length ? rows : 'table exists but no row (getSettings() treats absent as disabled)');
  if (await exists('whatsapp_automation_rules')) {
    const { rows: r } = await q(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE enabled)::int AS enabled FROM whatsapp_automation_rules`,
    );
    console.log('automation rules:', r[0]);
  }
} else {
  console.log('table absent -> getSettings() returns { enabled: false }, service is inert');
}

// ── 2. AI auto-reply ──────────────────────────────────────────────────────
console.log('\n=== 2. AI auto-reply (handleInboundForAi) ===');
if (await exists('whatsapp_ai_settings')) {
  const { rows } = await q(
    `SELECT account_project, enabled, mode, max_auto_replies FROM whatsapp_ai_settings ORDER BY account_project`,
  );
  console.table(rows);
} else {
  console.log('table absent');
}

// ── 3. Broadcasts ─────────────────────────────────────────────────────────
console.log('\n=== 3. broadcasts ===');
if (await exists('whatsapp_broadcasts')) {
  const { rows } = await q(
    `SELECT id, name, account_project, status,
            (SELECT count(*)::int FROM whatsapp_broadcast_recipients r WHERE r.broadcast_id = b.id) AS recipients
       FROM whatsapp_broadcasts b ORDER BY id DESC LIMIT 10`,
  );
  console.table(rows);
} else { console.log('table absent'); }

// ── 4. Scheduled / queue-driven sends ─────────────────────────────────────
console.log('\n=== 4. schedulers that could fire a send ===');
if (await exists('whatsapp_broadcasts')) {
  const { rows } = await q(
    `SELECT count(*)::int AS running_or_queued
       FROM whatsapp_broadcasts WHERE status IN ('running','queued','processing','pending')`,
  );
  console.log('broadcasts in a running/queued state:', rows[0].running_or_queued);
}

// ── 5. Messages sent unattended in the last 30 days ───────────────────────
console.log('\n=== 5. unattended outbound already in messages ===');
const { rows: auto } = await q(
  `SELECT COALESCE(message_category,'(null)') AS category,
          count(*)::int AS n,
          max(created_at) AS latest
     FROM messages
    WHERE is_automated = true OR user_id IN ('ai-bot','whatsapp-test')
      AND created_at > now() - interval '30 days'
    GROUP BY 1 ORDER BY n DESC`,
);
console.log(auto.length ? auto : 'none in the last 30 days');

// ── 6. Duplicate inbound messages (webhook idempotency evidence) ─────────
console.log('\n=== 6. duplicate inbound wa_message_id (webhook idempotency) ===');
const { rows: dupes } = await q(
  `SELECT count(*)::int AS duplicate_groups, COALESCE(sum(c) - count(*)::int, 0)::int AS extra_rows
     FROM (SELECT wa_message_id, count(*)::int AS c
             FROM messages
            WHERE direction = 'inbound' AND wa_message_id IS NOT NULL
            GROUP BY wa_message_id HAVING count(*) > 1) x`,
);
console.log(dupes[0]);

// ── 7. PDF sends ──────────────────────────────────────────────────────────
console.log('\n=== 7. receipt / PDF sends in the last 30 days ===');
const { rows: pdfs } = await q(
  `SELECT COALESCE(message_category,'(null)') AS category, count(*)::int AS n, max(created_at) AS latest
     FROM messages
    WHERE message_type = 'document' AND created_at > now() - interval '30 days'
    GROUP BY 1 ORDER BY n DESC`,
);
console.log(pdfs.length ? pdfs : 'no document-type messages in the last 30 days');

process.exit(0);