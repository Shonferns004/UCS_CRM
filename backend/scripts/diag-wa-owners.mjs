// READ-ONLY. Counts conversations whose assigned_agent_id is not a uuid.
//
// routingService.applyRouting writes `whatsapp_routing_rules.assignee_id` --
// free text -- straight into conversations.assigned_agent_id. Those rows can
// never match a real session id, so every ownership rule that reads the column
// treats them as owned by nobody and hides the donor from their own agent.
//
// resetStaleWhatsAppOwners.js would have wiped the column to fix that. It is
// out of scope, so the fix is applied at READ time instead. This script
// measures how many rows that affects.

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

const { rows: totals } = await q(
  `SELECT count(*)::int AS total,
          count(*) FILTER (WHERE assigned_agent_id IS NULL)::int AS unassigned,
          count(*) FILTER (WHERE assigned_agent_id IS NOT NULL)::int AS owned
     FROM conversations`,
);
console.log('=== conversations.assigned_agent_id ===');
console.log(totals[0]);

// The column type matters: if it is uuid, routingService's free-text
// assignee_id cannot be stored at all (the write throws and is caught), so the
// "stale owner" problem resetStaleWhatsAppOwners was written to solve cannot
// occur in this database.
const { rows: colType } = await q(
  `SELECT data_type, is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name='conversations' AND column_name='assigned_agent_id'`,
);
console.log('\ncolumn type:', colType[0] || 'NOT FOUND');

const { rows: samples } = await q(
  `SELECT c.id, c.assigned_agent_id::text AS owner, c.assigned_to, c.project
     FROM conversations c
    WHERE c.assigned_agent_id IS NOT NULL
    LIMIT 10`,
);
console.log('\nsample owners:');
console.table(samples);

// Do any owners point at a crm_agents / workers row at all?
const { rows: orphans } = await q(
  `SELECT count(*)::int AS n
     FROM conversations c
    WHERE c.assigned_agent_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM crm_agents a WHERE a.id = c.assigned_agent_id)
      AND NOT EXISTS (SELECT 1 FROM workers w WHERE w.id = c.assigned_agent_id)`,
);
console.log('\nowners matching neither crm_agents nor workers:', orphans[0].n);

process.exit(0);