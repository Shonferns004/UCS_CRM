import db from '../config/db.js';

// One-shot data reset for conversations.assigned_agent_id.
//
// ── Why ────────────────────────────────────────────────────────────────────
//
// The column was never trustworthy. Three unrelated writers put three
// incompatible id domains into it:
//
//   froWhatsAppService.sendFroReply   -> the token's id (crm_agents.id for an
//                                         agent session, workers.id otherwise)
//   agentTransferController.claim      -> the token's id
//   routingService.applyRouting        -> a FREE-TEXT keyword rule's assignee_id
//
// The visibility rule now reads `assigned_agent_id` to decide whose thread is
// whose (services/whatsappScope.js). A row carrying a routing-rule string can
// never match a real token, so it would hide that donor from their own agent and
// show them only to the WhatsApp admin.
//
// Clearing the column makes ownership derive from the fro_assignments allotment
// instead, which is the authoritative record of who a donor belongs to. Threads
// re-acquire an owner the moment their owner replies -- that is already the
// normal claim path in sendFroReply.
//
// ── Why it is guarded ───────────────────────────────────────────────────────
//
// This is the only statement here that is not idempotent: running it twice
// would discard claims made since the first run. Migrations in this deployment
// are hand-applied and there is no migration runner, so this self-applies on
// boot -- but exactly once, recorded in backend_one_shot_tasks. Until that row
// exists the backend is in the old, leaky state, which is the reason to let it
// run rather than leave a .sql file for someone to forget.

const MARKER = 'reset_whatsapp_assigned_agent_id_v1';

async function run(sqlText) {
  await db._pool.query(sqlText);
}

export async function resetStaleWhatsAppOwners() {
  const { rows: existing } = await db._pool.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='backend_one_shot_tasks'`,
  );

  if (!existing.length) {
    await run(`CREATE TABLE IF NOT EXISTS public.backend_one_shot_tasks (
      key         text PRIMARY KEY,
      ran_at      timestamptz NOT NULL DEFAULT now(),
      detail      text
    )`);
  }

  const { rows: done } = await db._pool.query(
    `SELECT 1 FROM backend_one_shot_tasks WHERE key = $1`,
    [MARKER],
  );
  if (done.length) return;

  const { rows: cleared } = await db._pool.query(
    `UPDATE conversations
        SET assigned_agent_id = NULL
      WHERE assigned_agent_id IS NOT NULL
      RETURNING id`,
  );

  await db._pool.query(
    `INSERT INTO backend_one_shot_tasks (key, detail)
     VALUES ($1, $2)
     ON CONFLICT (key) DO NOTHING`,
    [MARKER, `cleared ${cleared.length} conversation(s)`],
  );

  if (cleared.length) {
    console.log(
      `[whatsapp owners] cleared assigned_agent_id on ${cleared.length} conversation(s); `
      + 'ownership now derives from the donor allotment',
    );
  }
}