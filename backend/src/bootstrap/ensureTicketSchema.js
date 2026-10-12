import db from '../config/db.js';

// Ticket schema bootstrap — idempotent re-application of the columns added by
// migrations 109 and 111 (desk_number / ngo / raised_by_panel on the ticket
// tables, and sender identity on ticket_replies). Re-runs safely on every boot
// via ADD COLUMN IF NOT EXISTS, so a fresh or partially-migrated DB is repaired
// automatically. Only ticket tables are touched; nothing else is read or changed.
const COLUMN_STEPS = [
  `ALTER TABLE support_tickets   ADD COLUMN IF NOT EXISTS desk_number     TEXT`,
  `ALTER TABLE support_tickets   ADD COLUMN IF NOT EXISTS ngo             TEXT`,
  `ALTER TABLE support_tickets   ADD COLUMN IF NOT EXISTS raised_by_panel TEXT`,
  `ALTER TABLE ticket_replies    ADD COLUMN IF NOT EXISTS sender_name     TEXT`,
  `ALTER TABLE ticket_replies    ADD COLUMN IF NOT EXISTS sender_panel    TEXT`,
  `ALTER TABLE developer_tickets ADD COLUMN IF NOT EXISTS desk_number     TEXT`,
  `ALTER TABLE developer_tickets ADD COLUMN IF NOT EXISTS ngo             TEXT`,
  `ALTER TABLE developer_tickets ADD COLUMN IF NOT EXISTS raised_by_panel TEXT`,
];

const TICKET_TABLES = ['support_tickets', 'ticket_replies', 'developer_tickets'];

// One row = one person has already been shown the "ticket raised" popup for
// that ticket, so it never pops again on any device. TEXT ids mirror
// notice_seen (user and ticket ids are UUIDs, stored as text); the ticket id
// is prefixed 'sup:'/'dev:' by the controller so support and developer
// tickets share one table without id collisions.
//
// ticket_popup_baseline stamps the moment each person's panel first asked for
// popups. Tickets raised BEFORE that instant are "old" for that person and
// must never pop — without it, adopting this feature would parade every open
// ticket already sitting in the queue.
//
// Kept as SEPARATE statements on purpose: the sessions carry a 10s
// lock_timeout, and when boot-time contention hits, one multi-statement
// string rolls back as a unit — which is exactly how ticket_popup_baseline
// went missing while ticket_popup_seen existed.
const POPUP_DDL = [
  `CREATE TABLE IF NOT EXISTS ticket_popup_seen (
     id BIGSERIAL PRIMARY KEY,
     ticket_id TEXT NOT NULL,
     user_id TEXT NOT NULL,
     seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (ticket_id, user_id)
   )`,
  `ALTER TABLE ticket_popup_seen ALTER COLUMN ticket_id TYPE TEXT USING ticket_id::text`,
  `ALTER TABLE ticket_popup_seen ALTER COLUMN user_id  TYPE TEXT USING user_id::text`,
  `CREATE TABLE IF NOT EXISTS ticket_popup_baseline (
     user_id TEXT PRIMARY KEY,
     since TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE ticket_popup_baseline ALTER COLUMN user_id TYPE TEXT USING user_id::text`,
];

// Run DDL with the session's lock_timeout lifted for the statement only
// (SET LOCAL reverts at COMMIT), split out and retried: boot may collide with
// long-running reports holding table locks, and losing that race must degrade
// to "retry in a second", never to "feature silently half-installed".
const runPopupDdl = async (sql) => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const client = await db._pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '0'");
      await client.query(sql);
      await client.query('COMMIT');
      return;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* conn may be gone */ }
      if (attempt === 3) throw e;
      await new Promise(r => setTimeout(r, 1500));
    } finally {
      client.release();
    }
  }
};

function tableExists(name) {
  return db._pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [name]
  ).then(r => r.rows.length > 0);
}

export async function ensureTicketSchema() {
  const present = {};
  for (const t of TICKET_TABLES) present[t] = await tableExists(t);

  for (const sqlText of COLUMN_STEPS) {
    const table = /ALTER TABLE (\w+)/.exec(sqlText)[1];
    if (!present[table]) continue;
    try {
      await db._pool.query(sqlText);
    } catch (e) {
      // Column may already exist under a race / parallel boot; not fatal.
      console.warn('[ticket schema] skip:', e?.message || String(e));
    }
  }

  let popupFailures = 0;
  for (const sqlText of POPUP_DDL) {
    try {
      await runPopupDdl(sqlText);
    } catch (e) {
      popupFailures++;
      console.warn('[ticket schema] popup ddl failed:', e?.message || String(e));
    }
  }
  if (popupFailures === 0) console.log('ticket_popup_seen + ticket_popup_baseline tables ready');
}