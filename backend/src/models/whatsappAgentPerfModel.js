import db from '../config/db.js';

// Per-agent WhatsApp performance for the admin surface.
//
// WHY RAW SQL AND NOT THE QUERY BUILDER: every figure here is an aggregate over
// the whole messages/conversations pair for a time window, with the agent's
// FIRST send per conversation compared against the conversation's first inbound.
// The builder (db.js) has no array-contains operator and no FILTER support, so
// the window and the sentinels would otherwise have to be filtered in JS over a
// 1000-row page -- which silently under-counts every agent whose work falls off
// the page. Same reason analyticsService.js:60 writes plain SQL.

// messages.user_id is TEXT with no FK (crmAgentModel.js:9 calls
// worker_agent_assignments "the WhatsApp routing table"; the FK itself was never
// declared). It carries a worker's uuid on every human send -- froWhatsAppService
// .js:225, :492, :1135 all write String(froWorkerId) -- but it ALSO carries
// non-human senders that would otherwise top the leaderboard:
//
//   'ai-bot'              aiReplyService.js:189
//   'whatsapp-automation' whatsappAutomationService.js:385
//   'unknown'             whatsappEnhancementsController.js:315
//
// analyticsService.js:70 excludes only 'ai-bot', which is why that endpoint
// (never called by any UI) ranks an automation as an agent. These are excluded
// together here.
const NON_HUMAN_SENDERS = ['ai-bot', 'whatsapp-automation', 'unknown'];

const SENTINELS = NON_HUMAN_SENDERS.map((v) => `'${v}'`).join(', ');

// Who is on the roster.
//
// fro_whatsapp_assignments is the table the admin UI itself manages
// (froWhatsAppAssignmentModel.listAgentsForAccount), so it is the roster. crm_agents
// is unioned in because a login agent is a real operator who can reply from the
// FRO panel even before anybody assigns their FRO to a number -- without it an
// active agent with messages would be missing from the board entirely.
export async function listAgentRoster({ project = null } = {}) {
  const { rows } = await db._pool.query(
    `
    WITH assigned AS (
      SELECT DISTINCT fwa.fro_worker_id AS worker_id
        FROM fro_whatsapp_assignments fwa
        LEFT JOIN whatsapp_accounts wa ON wa.id = fwa.whatsapp_account_id
       WHERE ($1::text IS NULL OR wa.project = $1)
    ),
    logged_in AS (
      SELECT DISTINCT ca.worker_id
        FROM crm_agents ca
       WHERE ca.is_active
         AND ca.worker_id IS NOT NULL
    ),
    roster AS (
      SELECT worker_id FROM assigned
      UNION
      SELECT worker_id FROM logged_in
    )
    SELECT w.id AS worker_id,
           w.name,
           w.login_id,
           w.phone,
           ca.label AS agent_label,
           (
             SELECT string_agg(DISTINCT wa.project, ',')
               FROM fro_whatsapp_assignments fwa
               JOIN whatsapp_accounts wa ON wa.id = fwa.whatsapp_account_id
              WHERE fwa.fro_worker_id = w.id
           ) AS projects,
           (
             SELECT count(DISTINCT fwa.whatsapp_account_id)
               FROM fro_whatsapp_assignments fwa
              WHERE fwa.fro_worker_id = w.id
           )::int AS account_count
      FROM roster r
      JOIN workers w ON w.id = r.worker_id
      LEFT JOIN crm_agents ca ON ca.worker_id = w.id AND ca.is_active
     ORDER BY w.name
    `,
    [project || null]
  );
  return rows;
}

// One row per agent: the numbers the leaderboard ranks on.
//
// `chats` is DISTINCT conversations the agent sent into, not a message count --
// an agent who sends 40 messages across 3 chats is doing 3 conversations' work,
// and the old analyticsService.js:60 figure conflated the two.
//
// `replies_received` counts inbound messages on those SAME conversations, which
// is what the agent was answering. It cannot be attributed to an agent directly:
// inbound rows carry user_id = NULL (whatsappWebhookController.js:122-133), so
// there is nobody to attribute them to at write time.
//
// `avg_first_response_mins` compares THIS agent's first send in a conversation
// against that conversation's first inbound. Conversations where the agent's
// first send precedes any inbound (they opened the chat themselves) are dropped
// from the average rather than counted as an instant reply.
export async function getAgentStats({ project = null, from, to } = {}) {
  const { rows } = await db._pool.query(
    `
    WITH conv_window AS (
      SELECT c.id AS conversation_id,
             c.project,
             min(m.created_at) FILTER (WHERE m.direction = 'inbound')  AS first_in,
             count(*) FILTER (WHERE m.direction = 'inbound')          AS inbound_total
        FROM conversations c
        JOIN messages m ON m.conversation_id = c.id
       WHERE m.created_at >= $2::timestamptz
         AND m.created_at <  $3::timestamptz
         AND ($1::text IS NULL OR c.project = $1)
       GROUP BY c.id, c.project
    ),
    agent_conv AS (
      SELECT m.user_id AS worker_id,
             m.conversation_id,
             count(*)::int                            AS sent,
             (count(*) FILTER (WHERE m.status = 'failed'))::int AS failed,
             min(m.created_at)                   AS first_sent
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
       WHERE m.direction = 'outbound'
         AND m.created_at >= $2::timestamptz
         AND m.created_at <  $3::timestamptz
         AND m.user_id IS NOT NULL
         AND m.user_id NOT IN (${SENTINELS})
         AND ($1::text IS NULL OR c.project = $1)
       GROUP BY m.user_id, m.conversation_id
    )
    SELECT ac.worker_id,
           count(*)::int                              AS chats,
           sum(ac.sent)::int                          AS messages_sent,
           sum(ac.failed)::int                        AS failed_messages,
           sum(cw.inbound_total)::int                 AS replies_received,
           avg(EXTRACT(EPOCH FROM (ac.first_sent - cw.first_in)) / 60.0)
             FILTER (WHERE ac.first_sent > cw.first_in) AS avg_first_response_mins,
           max(ac.first_sent)                         AS last_activity_at
      FROM agent_conv ac
      JOIN conv_window cw ON cw.conversation_id = ac.conversation_id
     GROUP BY ac.worker_id
    `,
    [project || null, from, to]
  );
  return rows;
}

// The contact table behind one agent row: the conversations they actually worked
// in the window, with the contact behind each and a preview of where they left
// off.
//
// Ordered by the agent's own last send, not by conversation.last_message_at:
// once another operator (or the automation) replies in the same thread, that
// column stops describing this agent's work.
export async function listAgentConversations({
  workerId,
  project = null,
  from,
  to,
  limit = 100,
} = {}) {
  const { rows } = await db._pool.query(
    `
    WITH agent_window AS (
      SELECT m.conversation_id,
             count(*)::int                            AS sent,
             (count(*) FILTER (WHERE m.status = 'failed'))::int AS failed,
             max(m.created_at)                   AS last_sent_at,
             (array_agg(m.body_text ORDER BY m.created_at DESC))[1] AS last_message
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
       WHERE m.direction = 'outbound'
         AND m.user_id = $4
         AND m.created_at >= $2::timestamptz
         AND m.created_at <  $3::timestamptz
         AND ($1::text IS NULL OR c.project = $1)
       GROUP BY m.conversation_id
    )
    SELECT aw.conversation_id,
           c.status,
           c.project,
           aw.sent,
           aw.failed,
           aw.last_sent_at,
           COALESCE(NULLIF(aw.last_message, ''), '(no text)') AS last_message,
           ct.phone,
           ct.phone_normalized,
           ct.wa_profile_name,
           -- contacts carries NO first_name/last_name. Verified against the live
           -- schema, which is id, tenant_id, phone, phone_normalized,
           -- wa_profile_name, source, project, created_at -- and referencing the
           -- missing pair made this whole endpoint 500 with "column ct.first_name
           -- does not exist" the first time it ran against real data. The profile
           -- name is all there is.
           ct.wa_profile_name AS contact_name,
           (SELECT count(*) FROM messages m2
             WHERE m2.conversation_id = c.id
               AND m2.direction = 'inbound'
               AND m2.created_at >= $2::timestamptz
               AND m2.created_at <  $3::timestamptz)::int AS received
      FROM agent_window aw
      JOIN conversations c ON c.id = aw.conversation_id
      LEFT JOIN contacts ct ON ct.id = c.contact_id
     ORDER BY aw.last_sent_at DESC
     LIMIT $5
    `,
    [project || null, from, to, String(workerId), Math.max(1, Math.min(500, limit))]
  );
  return rows;
}